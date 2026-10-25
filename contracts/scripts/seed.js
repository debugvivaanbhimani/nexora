const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

const toBytes32 = (str) => ethers.encodeBytes32String(String(str).trim().slice(0, 31));

async function main() {
  const scenarioPath = process.env.SCENARIO;
  if (!scenarioPath) {
    throw new Error("SCENARIO environment variable is required (e.g. SCENARIO=../data/scenarios/reference.json)");
  }

  const resolvedScenarioPath = path.isAbsolute(scenarioPath)
    ? scenarioPath
    : path.resolve(process.cwd(), scenarioPath);

  if (!fs.existsSync(resolvedScenarioPath)) {
    throw new Error(`Scenario file not found at: ${resolvedScenarioPath}`);
  }

  const scenarioData = JSON.parse(fs.readFileSync(resolvedScenarioPath, "utf8"));
  console.log(`Loaded scenario from: ${resolvedScenarioPath}`);

  const deploymentPath = path.resolve(__dirname, "../../shared/deployment.json");
  if (!fs.existsSync(deploymentPath)) {
    throw new Error(`Deployment file not found at: ${deploymentPath}. Please run 'npm run deploy' first.`);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
  const [admin] = await ethers.getSigners();
  const ledger = await ethers.getContractAt("CollateralLedger", deployment.address, admin);
  console.log(`Connected to CollateralLedger at: ${deployment.address}`);

  // 1. Register Assets
  console.log("\n--- Registering Assets ---");
  const assetsList = [];
  if (Array.isArray(scenarioData.assets)) {
    for (const a of scenarioData.assets) {
      assetsList.push({
        id: a.id,
        cls: a.class || a.cls,
        qty: a.quantity !== undefined ? a.quantity : (a.qty !== undefined ? a.qty : a.total),
      });
    }
  } else if (scenarioData.assets && typeof scenarioData.assets === "object") {
    for (const [id, a] of Object.entries(scenarioData.assets)) {
      assetsList.push({
        id,
        cls: a.class || a.cls,
        qty: a.quantity !== undefined ? a.quantity : (a.qty !== undefined ? a.qty : a.total),
      });
    }
  }

  for (const asset of assetsList) {
    const idB32 = toBytes32(asset.id);
    const clsB32 = toBytes32(asset.cls);
    const qtyInt = BigInt(Math.floor(asset.qty));

    try {
      const existing = await ledger.getAsset(idB32);
      if (existing.exists) {
        console.log(`Asset ${asset.id} already registered (total: ${existing.total}). Skipping.`);
        continue;
      }
    } catch (_) {
      // getAsset reverts if UnknownAsset; proceeds to register
    }

    const tx = await ledger.registerAsset(idB32, clsB32, qtyInt);
    await tx.wait();
    console.log(`Registered asset: ${asset.id} | Class: ${asset.cls} | Quantity: ${qtyInt}`);
  }

  // 2. Set Eligibility Rules
  console.log("\n--- Setting Eligibility Rules ---");
  const eligibilityMap = new Map(); // obligationId -> Set of classes

  // Check scenarioData.rules
  if (Array.isArray(scenarioData.rules)) {
    for (const r of scenarioData.rules) {
      const oblId = r.obligation_id || r.obligationId || r.obligation || r.o;
      const classes = r.classes || (r.class ? [r.class] : (r.cls ? [r.cls] : []));
      if (oblId && classes.length > 0) {
        if (!eligibilityMap.has(oblId)) eligibilityMap.set(oblId, new Set());
        for (const c of classes) eligibilityMap.get(oblId).add(c);
      }
    }
  }

  // Check scenarioData.obligations
  if (Array.isArray(scenarioData.obligations)) {
    for (const o of scenarioData.obligations) {
      const oblId = o.id;
      const classes = o.eligible || o.classes || [];
      if (oblId && classes.length > 0) {
        if (!eligibilityMap.has(oblId)) eligibilityMap.set(oblId, new Set());
        for (const c of classes) eligibilityMap.get(oblId).add(c);
      }
    }
  } else if (scenarioData.obligations && typeof scenarioData.obligations === "object") {
    for (const [oblId, o] of Object.entries(scenarioData.obligations)) {
      const classes = o.eligible || o.classes || [];
      if (oblId && classes.length > 0) {
        if (!eligibilityMap.has(oblId)) eligibilityMap.set(oblId, new Set());
        for (const c of classes) eligibilityMap.get(oblId).add(c);
      }
    }
  }

  // Check scenarioData.eligibility mapping
  if (scenarioData.eligibility && typeof scenarioData.eligibility === "object") {
    for (const [oblId, classes] of Object.entries(scenarioData.eligibility)) {
      if (!eligibilityMap.has(oblId)) eligibilityMap.set(oblId, new Set());
      for (const c of (Array.isArray(classes) ? classes : [classes])) {
        eligibilityMap.get(oblId).add(c);
      }
    }
  }

  for (const [oblId, classSet] of eligibilityMap.entries()) {
    const oblB32 = toBytes32(oblId);
    const classesB32 = Array.from(classSet).map(toBytes32);
    const tx = await ledger.setEligibility(oblB32, classesB32, true);
    await tx.wait();
    console.log(`Set eligibility for obligation ${oblId} -> classes: [${Array.from(classSet).join(", ")}]`);
  }

  console.log("\nSeeding complete.");
}

main().catch((error) => {
  console.error("Seeding failed:", error);
  process.exitCode = 1;
});
