require("@nomicfoundation/hardhat-chai-matchers");
require("@nomicfoundation/hardhat-ethers");
require("hardhat-gas-reporter");
module.exports = {
  analytics: { enabled: false },
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  gasReporter: { enabled: true, outputFile: "gas-report.txt", noColors: true, currency: "USD" },
};
// Offline compiler: use the solc-js package from npm instead of downloading binaries
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args, hre, runSuper) => {
  if (args.solcVersion === "0.8.24") {
    return { compilerPath: path.join(__dirname, "node_modules", "solc", "soljson.js"), isSolcJs: true,
             version: args.solcVersion, longVersion: require("solc").version() };
  }
  return runSuper();
});
