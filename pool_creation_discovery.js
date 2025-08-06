#!/usr/bin/env node

/**
 * Pool Creation Discovery Script
 * Discovers actual pool creation patterns on BASE to find V4 addresses
 * Server: 185.191.117.142
 * RPC: http://localhost:8545 (BASE Mainnet)
 */

const { ethers } = require('ethers');

class PoolCreationDiscovery {
    constructor() {
        this.rpcUrl = 'http://localhost:8545';
        this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
        
        // Known signatures to look for
        this.signatures = {
            v3PoolCreated: '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118',
            transfer: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            // Common pool-related signatures
            initialize: '0x98636036cb66a9c19a37435efc1e90142190214e8abeb821bdba3f2990dd4c95',
            swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
            mint: '0x7a53080ba414158be7ec69b987b5fb7d07dee101fe85488f0853ae16239d0bde',
        };
        
        this.knownContracts = {
            v3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
            weth: '0x4200000000000000000000000000000000000006'
        };
        
        this.discoveredContracts = new Map();
        this.eventCounts = new Map();
    }

    async initialize() {
        console.log('🔍 POOL CREATION DISCOVERY');
        console.log('==========================');
        
        try {
            const [network, blockNumber] = await Promise.all([
                this.provider.getNetwork(),
                this.provider.getBlockNumber()
            ]);
            
            console.log(`✅ Connected to Chain ID: ${network.chainId}`);
            console.log(`✅ Current Block: ${blockNumber}`);
            console.log(`✅ Discovery Time: ${new Date().toISOString()}\n`);
            
            return blockNumber;
        } catch (error) {
            console.error('❌ Initialization failed:', error.message);
            return null;
        }
    }

    async scanForPoolCreationEvents(blocks = 1000) {
        const currentBlock = await this.initialize();
        if (!currentBlock) return;

        const fromBlock = currentBlock - blocks;
        
        console.log(`🔍 SCANNING LAST ${blocks} BLOCKS FOR POOL CREATION PATTERNS`);
        console.log(`📡 Blocks ${fromBlock} to ${currentBlock}\n`);

        try {
            // Scan for various pool-related event signatures
            for (const [name, signature] of Object.entries(this.signatures)) {
                console.log(`📡 Scanning for ${name} events (${signature})...`);
                
                try {
                    const logs = await this.provider.getLogs({
                        fromBlock,
                        toBlock: 'latest',
                        topics: [signature]
                    });
                    
                    console.log(`   Found ${logs.length} ${name} events`);
                    this.eventCounts.set(name, logs.length);
                    
                    // Analyze contract addresses for these events
                    const contracts = new Set();
                    logs.forEach(log => {
                        contracts.add(log.address.toLowerCase());
                    });
                    
                    console.log(`   Unique contracts: ${contracts.size}`);
                    if (contracts.size <= 10) {
                        contracts.forEach(addr => {
                            if (!this.discoveredContracts.has(addr)) {
                                this.discoveredContracts.set(addr, new Set());
                            }
                            this.discoveredContracts.get(addr).add(name);
                        });
                        console.log(`   Contracts: ${Array.from(contracts).join(', ')}`);
                    }
                    
                    // Show recent events for analysis
                    if (logs.length > 0 && logs.length <= 5) {
                        console.log(`   Recent events:`);
                        logs.slice(-3).forEach((log, i) => {
                            console.log(`     ${i + 1}. Block ${parseInt(log.blockNumber, 16)} - ${log.address} - ${log.transactionHash}`);
                        });
                    }
                    
                } catch (error) {
                    console.log(`   ❌ Error: ${error.message}`);
                }
                
                console.log('');
            }

            // Additional broad scan for any events from unknown contracts
            console.log(`🔍 SCANNING FOR UNKNOWN POOL CREATION PATTERNS...`);
            
            try {
                // Look for any events that might be pool creation but with different signatures
                const recentBlocks = 50; // Look at very recent blocks for patterns
                const recentFromBlock = currentBlock - recentBlocks;
                
                console.log(`📡 Scanning last ${recentBlocks} blocks for all events...`);
                
                const allLogs = await this.provider.getLogs({
                    fromBlock: recentFromBlock,
                    toBlock: 'latest'
                });
                
                console.log(`Found ${allLogs.length} total events in recent blocks`);
                
                // Analyze event signatures
                const signatureCounts = new Map();
                const contractEventCounts = new Map();
                
                allLogs.forEach(log => {
                    const signature = log.topics[0];
                    signatureCounts.set(signature, (signatureCounts.get(signature) || 0) + 1);
                    
                    const contractAddr = log.address.toLowerCase();
                    if (!contractEventCounts.has(contractAddr)) {
                        contractEventCounts.set(contractAddr, 0);
                    }
                    contractEventCounts.set(contractAddr, contractEventCounts.get(contractAddr) + 1);
                });
                
                console.log(`\n📊 TOP EVENT SIGNATURES BY FREQUENCY:`);
                const sortedSignatures = Array.from(signatureCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10);
                
                sortedSignatures.forEach(([sig, count], i) => {
                    const knownName = Object.entries(this.signatures).find(([name, s]) => s === sig)?.[0] || 'UNKNOWN';
                    console.log(`${i + 1}. ${sig} (${knownName}) - ${count} events`);
                });
                
                console.log(`\n📊 TOP CONTRACTS BY EVENT ACTIVITY:`);
                const sortedContracts = Array.from(contractEventCounts.entries())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 15);
                
                sortedContracts.forEach(([addr, count], i) => {
                    const isKnown = Object.values(this.knownContracts).includes(addr);
                    const knownName = isKnown ? 'V3_FACTORY' : 'UNKNOWN';
                    console.log(`${i + 1}. ${addr} (${knownName}) - ${count} events`);
                });
                
            } catch (error) {
                console.log(`❌ Broad scan failed: ${error.message}`);
            }

        } catch (error) {
            console.error('❌ Discovery scan failed:', error.message);
        }
    }

    async analyzeDiscoveredContracts() {
        console.log(`\n🔍 ANALYZING DISCOVERED CONTRACTS`);
        console.log('================================');
        
        for (const [contractAddr, eventTypes] of this.discoveredContracts.entries()) {
            console.log(`\n📋 Contract: ${contractAddr}`);
            console.log(`Events: ${Array.from(eventTypes).join(', ')}`);
            
            // Check if this might be a V4 contract
            const hasPoolEvents = eventTypes.has('v3PoolCreated') || eventTypes.has('initialize');
            const isKnownV3 = contractAddr === this.knownContracts.v3Factory.toLowerCase();
            
            if (hasPoolEvents && !isKnownV3) {
                console.log(`🎯 POTENTIAL V4 CONTRACT: ${contractAddr}`);
                
                // Try to get more info about this contract
                try {
                    const code = await this.provider.getCode(contractAddr);
                    if (code && code.length > 10) {
                        console.log(`   ✅ Has contract code (${code.length} bytes)`);
                        
                        // Try to call common contract methods
                        const commonSelectors = [
                            '0x06fdde03', // name()
                            '0x95d89b41', // symbol()
                            '0x54fd4d50', // version()
                        ];
                        
                        for (const selector of commonSelectors) {
                            try {
                                const result = await this.provider.call({
                                    to: contractAddr,
                                    data: selector
                                });
                                
                                if (result !== '0x' && result.length > 2) {
                                    try {
                                        const decoded = ethers.AbiCoder.defaultAbiCoder().decode(['string'], result)[0];
                                        console.log(`   Method ${selector}: "${decoded}"`);
                                    } catch {
                                        console.log(`   Method ${selector}: ${result.slice(0, 20)}...`);
                                    }
                                }
                            } catch {
                                // Ignore call failures
                            }
                        }
                    }
                } catch (error) {
                    console.log(`   ❌ Could not analyze contract: ${error.message}`);
                }
            }
        }
    }

    async generateUpdatedConfig() {
        console.log(`\n🎯 RECOMMENDED CONFIGURATION`);
        console.log('============================');
        
        // Find the most active non-V3 contracts that emit pool-like events
        const potentialV4Contracts = Array.from(this.discoveredContracts.entries())
            .filter(([addr, events]) => {
                const hasPoolEvents = events.has('v3PoolCreated') || events.has('initialize');
                const isNotV3 = addr !== this.knownContracts.v3Factory.toLowerCase();
                return hasPoolEvents && isNotV3;
            });
        
        console.log(`\nPotential Uniswap V4 / Other DEX Contracts:`);
        potentialV4Contracts.forEach(([addr, events], i) => {
            console.log(`${i + 1}. ${addr} - Events: ${Array.from(events).join(', ')}`);
        });
        
        console.log(`\nEvent Frequency Summary:`);
        for (const [eventName, count] of this.eventCounts.entries()) {
            console.log(`${eventName}: ${count} events`);
        }
        
        if (potentialV4Contracts.length > 0) {
            console.log(`\n📋 SUGGESTED TRADER CONFIGURATION:`);
            console.log(`v4PoolManager: '${potentialV4Contracts[0][0]}'  // Most active potential V4 contract`);
            if (potentialV4Contracts.length > 1) {
                console.log(`// Alternative: '${potentialV4Contracts[1][0]}'`);
            }
        }
        
        console.log(`\n✅ Discovery complete! Use these addresses in the V3+V4 trader.`);
    }
}

// Main execution
async function main() {
    const discovery = new PoolCreationDiscovery();
    const blocks = parseInt(process.argv[2]) || 1000;
    
    await discovery.scanForPoolCreationEvents(blocks);
    await discovery.analyzeDiscoveredContracts();
    await discovery.generateUpdatedConfig();
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = PoolCreationDiscovery; 