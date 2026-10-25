const { expect } = require("chai");
const { ethers } = require("hardhat");
const b = (s) => ethers.encodeBytes32String(s);

describe("CollateralLedger", function () {
  let ledger, admin, desk1, desk2, outsider;
  const assets = [["CASH", "CASH", 30], ["TBILL", "TBILL", 20], ["GSEC_MID", "GSEC_MID", 40],
                  ["GSEC_LONG", "GSEC_LONG", 30], ["CORP_AAA", "CORP_AAA", 20], ["EQUITY_NIFTY", "EQUITY", 25]];
  const elig = { O1: ["CASH", "TBILL", "GSEC_MID", "GSEC_LONG"], O2: ["GSEC_MID", "GSEC_LONG", "CORP_AAA", "EQUITY"], O3: ["TBILL", "GSEC_MID"] };

  async function ver(id) { return (await ledger.getAsset(b(id))).version; }
  async function plan(lines) { // lines: [asset, obligation, qty]
    const vs = []; for (const l of lines) vs.push(await ver(l[0]));
    return [lines.map(l => b(l[0])), lines.map(l => b(l[1])), lines.map(l => l[2]), vs];
  }

  beforeEach(async () => {
    [admin, desk1, desk2, outsider] = await ethers.getSigners();
    ledger = await (await ethers.getContractFactory("CollateralLedger")).deploy(admin.address);
    await ledger.grantRole(await ledger.ALLOCATOR_ROLE(), desk1.address);
    await ledger.grantRole(await ledger.ALLOCATOR_ROLE(), desk2.address);
    for (const [id, cls, q] of assets) await ledger.registerAsset(b(id), b(cls), q);
    for (const [o, cls] of Object.entries(elig)) await ledger.setEligibility(b(o), cls.map(b), true);
  });

  it("commits a full plan atomically and updates availability", async () => {
    const p = await plan([["CASH", "O1", 27], ["GSEC_LONG", "O1", 30], ["TBILL", "O3", 20], ["GSEC_MID", "O3", 31], ["GSEC_MID", "O2", 5], ["CORP_AAA", "O2", 20], ["EQUITY_NIFTY", "O2", 25]]);
    await expect(ledger.connect(desk1).reserveBatch(b("PLAN-1"), ...p, ethers.id("plan")))
      .to.emit(ledger, "AllocationCommitted");
    expect(await ledger.available(b("GSEC_MID"))).to.equal(4);
    expect(await ledger.available(b("CASH"))).to.equal(3);
    expect(await ledger.pledgedTo(b("O3"), b("GSEC_MID"))).to.equal(31);
  });

  it("rejects an excessive reservation (InsufficientQuantity)", async () => {
    const p = await plan([["TBILL", "O3", 21]]);
    await expect(ledger.connect(desk1).reserveBatch(b("X"), ...p, ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "InsufficientQuantity").withArgs(b("TBILL"), 21, 20);
  });

  it("blocks a double pledge across desks", async () => {
    await ledger.connect(desk1).reserveBatch(b("D1"), ...(await plan([["GSEC_MID", "O3", 35]])), ethers.ZeroHash);
    await expect(ledger.connect(desk2).reserveBatch(b("D2"), ...(await plan([["GSEC_MID", "O2", 6]])), ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "InsufficientQuantity").withArgs(b("GSEC_MID"), 6, 5);
  });

  it("rejects a duplicate allocation id", async () => {
    const p = await plan([["CASH", "O1", 1]]);
    await ledger.connect(desk1).reserveBatch(b("DUP"), ...p, ethers.ZeroHash);
    const p2 = await plan([["CASH", "O1", 1]]);
    await expect(ledger.connect(desk1).reserveBatch(b("DUP"), ...p2, ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "DuplicateAllocation");
  });

  it("rejects an ineligible asset", async () => {
    await expect(ledger.connect(desk1).reserveBatch(b("I"), ...(await plan([["EQUITY_NIFTY", "O3", 1]])), ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "Ineligible");
  });

  it("rejects a stale plan after inventory changes", async () => {
    const p = await plan([["CASH", "O1", 5]]);
    await ledger.setTotal(b("CASH"), 29);
    await expect(ledger.connect(desk1).reserveBatch(b("S"), ...p, ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "StalePlan");
  });

  it("race for the last units: first wins, second is rejected", async () => {
    const p1 = await plan([["TBILL", "O3", 15]]);
    const p2 = await plan([["TBILL", "O1", 10]]); // computed on the same state
    await ledger.connect(desk1).reserveBatch(b("R1"), ...p1, ethers.ZeroHash);
    await expect(ledger.connect(desk2).reserveBatch(b("R2"), ...p2, ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "StalePlan"); // version moved; even with a fresh version it would be InsufficientQuantity
    const p3 = await plan([["TBILL", "O1", 10]]);
    await expect(ledger.connect(desk2).reserveBatch(b("R3"), ...p3, ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "InsufficientQuantity");
  });

  it("rolls back the whole batch if the last line fails", async () => {
    const p = await plan([["CASH", "O1", 10], ["GSEC_LONG", "O1", 10], ["TBILL", "O3", 99]]);
    await expect(ledger.connect(desk1).reserveBatch(b("ROLL"), ...p, ethers.ZeroHash)).to.be.reverted;
    expect(await ledger.available(b("CASH"))).to.equal(30);
    expect(await ledger.available(b("GSEC_LONG"))).to.equal(30);
  });

  it("handles the same asset on several lines cumulatively", async () => {
    const p = await plan([["GSEC_MID", "O1", 25], ["GSEC_MID", "O3", 16]]);
    await expect(ledger.connect(desk1).reserveBatch(b("CUM"), ...p, ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "InsufficientQuantity").withArgs(b("GSEC_MID"), 16, 15);
  });

  it("enforces roles", async () => {
    await expect(ledger.connect(outsider).reserveBatch(b("Z"), ...(await plan([["CASH", "O1", 1]])), ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "AccessControlUnauthorizedAccount");
    await expect(ledger.connect(desk1).setTotal(b("CASH"), 100))
      .to.be.revertedWithCustomError(ledger, "AccessControlUnauthorizedAccount");
  });

  it("cannot cut total below reserved", async () => {
    await ledger.connect(desk1).reserveBatch(b("T"), ...(await plan([["CASH", "O1", 20]])), ethers.ZeroHash);
    await expect(ledger.setTotal(b("CASH"), 19)).to.be.revertedWithCustomError(ledger, "TotalBelowReserved");
  });

  it("release frees everything and cannot be repeated", async () => {
    await ledger.connect(desk1).reserveBatch(b("REL"), ...(await plan([["CASH", "O1", 20], ["TBILL", "O3", 5]])), ethers.ZeroHash);
    await expect(ledger.connect(desk1).release(b("REL"))).to.emit(ledger, "AllocationReleased");
    expect(await ledger.available(b("CASH"))).to.equal(30);
    await expect(ledger.connect(desk1).release(b("REL"))).to.be.revertedWithCustomError(ledger, "AllocationNotActive");
  });

  it("substitutes collateral atomically", async () => {
    await ledger.connect(desk1).reserveBatch(b("SUB"), ...(await plan([["CASH", "O1", 20]])), ethers.ZeroHash);
    await ledger.connect(desk1).substitute(b("SUB"), 0, b("GSEC_LONG"), 21, await ver("GSEC_LONG"));
    expect(await ledger.available(b("CASH"))).to.equal(30);
    expect(await ledger.available(b("GSEC_LONG"))).to.equal(9);
    await expect(ledger.connect(desk1).substitute(b("SUB"), 0, b("EQUITY_NIFTY"), 5, await ver("EQUITY_NIFTY")))
      .to.be.revertedWithCustomError(ledger, "Ineligible");
  });

  it("pause stops new reservations", async () => {
    await ledger.pause();
    await expect(ledger.connect(desk1).reserveBatch(b("P"), ...(await plan([["CASH", "O1", 1]])), ethers.ZeroHash))
      .to.be.revertedWithCustomError(ledger, "EnforcedPause");
  });

  it("gas: batch sizes 1, 5, 10, 25 lines", async () => {
    const ids = ["CASH", "TBILL", "GSEC_MID", "GSEC_LONG"];
    for (const n of [1, 5, 10, 25]) {
      const lines = Array.from({ length: n }, (_, i) => [ids[i % 4], "O1", 1]);
      const p = await plan(lines);
      const tx = await ledger.connect(desk1).reserveBatch(b("G" + n), ...p, ethers.ZeroHash);
      const r = await tx.wait();
      console.log(`      gas reserveBatch ${n} lines: ${r.gasUsed}`);
    }
  });
});
