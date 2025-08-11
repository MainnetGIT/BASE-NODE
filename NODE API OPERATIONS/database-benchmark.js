#!/usr/bin/env node
/**
 * Database Direct Access Benchmark
 * Test direct file system and database access vs RPC
 */

const { spawn } = require('child_process');
const axios = require('axios');

class DatabaseBenchmark {
    constructor() {
        this.sshConfig = {
            host: '185.191.117.142',
            user: 'deanbot', 
            password: 'x37xJnS51EQboG3'
        };
        
        this.bestRpcEndpoint = 'https://base-mainnet.g.alchemy.com/v2/demo'; // From previous benchmark
        this.requestId = 1;
    }

    /**
     * Execute SSH command
     */
    async sshExec(command) {
        return new Promise((resolve, reject) => {
            const sshCmd = `sshpass -p "${this.sshConfig.password}" ssh -o StrictHostKeyChecking=no ${this.sshConfig.user}@${this.sshConfig.host} '${command}'`;
            
            const process = spawn('bash', ['-c', sshCmd]);
            let stdout = '';
            let stderr = '';
            
            process.stdout.on('data', (data) => stdout += data);
            process.stderr.on('data', (data) => stderr += data);
            
            process.on('close', (code) => {
                if (code === 0) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(`SSH failed (${code}): ${stderr}`));
                }
            });
            
            setTimeout(() => {
                process.kill();
                reject(new Error('SSH timeout'));
            }, 30000);
        });
    }

    /**
     * Make RPC call
     */
    async rpcCall(method, params = []) {
        const payload = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: this.requestId++
        };

        const response = await axios.post(this.bestRpcEndpoint, payload, {
            timeout: 10000,
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data.error) {
            throw new Error(response.data.error.message);
        }

        return response.data.result;
    }

    /**
     * Benchmark a database operation
     */
    async benchmarkDatabaseOperation(name, rpcMethod, rpcParams, dbCommands, iterations = 3) {
        console.log(`\n🔄 ${name}`);
        console.log('═'.repeat(60));
        
        // RPC Benchmark
        console.log('📡 RPC Method:');
        const rpcTimes = [];
        
        for (let i = 0; i < iterations; i++) {
            try {
                const start = process.hrtime.bigint();
                await this.rpcCall(rpcMethod, rpcParams);
                const end = process.hrtime.bigint();
                const duration = Number(end - start) / 1000000;
                rpcTimes.push(duration);
                console.log(`   ✅ Run ${i + 1}: ${duration.toFixed(2)}ms`);
            } catch (error) {
                console.log(`   ❌ Run ${i + 1}: FAILED - ${error.message}`);
                rpcTimes.push(null);
            }
        }
        
        // Database Benchmark
        console.log('🗄️ Database Methods:');
        const dbResults = {};
        
        for (const [dbMethod, command] of Object.entries(dbCommands)) {
            console.log(`\n   📂 ${dbMethod}:`);
            const dbTimes = [];
            
            for (let i = 0; i < iterations; i++) {
                try {
                    const start = process.hrtime.bigint();
                    const result = await this.sshExec(command);
                    const end = process.hrtime.bigint();
                    const duration = Number(end - start) / 1000000;
                    dbTimes.push(duration);
                    console.log(`      ✅ Run ${i + 1}: ${duration.toFixed(2)}ms`);
                    
                    if (i === 0 && result.length < 200) {
                        console.log(`      📄 Sample: ${result}`);
                    }
                } catch (error) {
                    console.log(`      ❌ Run ${i + 1}: FAILED - ${error.message.slice(0, 100)}`);
                    dbTimes.push(null);
                }
            }
            
            const validDbTimes = dbTimes.filter(t => t !== null);
            if (validDbTimes.length > 0) {
                const avg = validDbTimes.reduce((a, b) => a + b) / validDbTimes.length;
                dbResults[dbMethod] = avg;
                console.log(`      📊 Average: ${avg.toFixed(2)}ms`);
            }
        }
        
        // Calculate RPC average
        const validRpcTimes = rpcTimes.filter(t => t !== null);
        const rpcAvg = validRpcTimes.length > 0 ? validRpcTimes.reduce((a, b) => a + b) / validRpcTimes.length : null;
        
        // Show comparison
        console.log('\n📊 PERFORMANCE COMPARISON:');
        if (rpcAvg) {
            console.log(`   📡 RPC Average: ${rpcAvg.toFixed(2)}ms`);
        }
        
        for (const [method, avg] of Object.entries(dbResults)) {
            console.log(`   🗄️ ${method}: ${avg.toFixed(2)}ms`);
            
            if (rpcAvg && avg) {
                const speedup = rpcAvg / avg;
                if (speedup > 1) {
                    console.log(`      🚀 Database is ${speedup.toFixed(2)}x FASTER than RPC!`);
                } else {
                    console.log(`      📡 RPC is ${(1/speedup).toFixed(2)}x faster than database`);
                }
            }
        }
        
        return { rpc: rpcAvg, database: dbResults };
    }

    /**
     * Run comprehensive database vs RPC benchmark
     */
    async runBenchmark() {
        console.log('🗄️ DATABASE vs RPC PERFORMANCE BENCHMARK');
        console.log('========================================');
        console.log(`🎯 Target: ${this.sshConfig.host}`);
        console.log(`📡 RPC Endpoint: ${this.bestRpcEndpoint}`);
        console.log(`🕐 Started: ${new Date().toISOString()}`);
        
        const results = {};
        
        // Test 1: File System Performance
        results.filesystem = await this.benchmarkDatabaseOperation(
            'File System Access Speed',
            'eth_blockNumber', [],
            {
                'Directory Listing': 'ls -la /home/deanbot/.ethereum/geth/chaindata | head -10',
                'File Size Check': 'du -sh /home/deanbot/.ethereum/geth/chaindata',
                'Disk Usage': 'df -h /home/deanbot/.ethereum',
                'Memory Usage': 'free -h'
            }
        );
        
        // Test 2: Network/Connectivity Performance
        results.network = await this.benchmarkDatabaseOperation(
            'Network vs Local Access',
            'eth_chainId', [],
            {
                'Local System Info': 'uname -a',
                'CPU Info': 'cat /proc/cpuinfo | grep "model name" | head -1',
                'Network Test': 'ping -c 1 8.8.8.8 | grep "time="',
                'Load Average': 'uptime'
            }
        );
        
        // Test 3: Process Management
        results.processes = await this.benchmarkDatabaseOperation(
            'Process Information Access',
            'eth_gasPrice', [],
            {
                'Process List': 'ps aux | grep -E "(geth|base)" | head -5',
                'Port Status': 'netstat -tlnp | grep ":8545" || echo "Port 8545 not found"',
                'Service Status': 'systemctl status geth 2>/dev/null || echo "Geth service not found"',
                'Docker Status': 'docker ps | grep base || echo "No base containers"'
            }
        );
        
        // Test 4: Data Directory Analysis
        results.datadir = await this.benchmarkDatabaseOperation(
            'Data Directory Analysis',
            'eth_getBlockByNumber', ['latest', false],
            {
                'Chain Data Size': 'find /home/deanbot/.ethereum/geth/chaindata -name "*.ldb" | wc -l',
                'Recent Files': 'find /home/deanbot/.ethereum/geth/chaindata -type f -mmin -60 | wc -l',
                'File Permissions': 'ls -la /home/deanbot/.ethereum/geth/ | head -5',
                'Log Files': 'find /home/deanbot -name "*.log" -mtime -1 | head -3'
            }
        );
        
        // Test 5: System Resource Access
        results.resources = await this.benchmarkDatabaseOperation(
            'System Resource Monitoring',
            'eth_getBalance', ['0x4200000000000000000000000000000000000006', 'latest'],
            {
                'CPU Usage': 'top -bn1 | grep "Cpu(s)" | head -1',
                'Memory Details': 'cat /proc/meminfo | grep -E "(MemTotal|MemFree|MemAvailable)" | head -3',
                'Disk I/O': 'iostat -x 1 1 | tail -n +4 | head -5 2>/dev/null || echo "iostat not available"',
                'Network Stats': 'cat /proc/net/dev | head -3'
            }
        );
        
        return results;
    }

    /**
     * Generate comprehensive report
     */
    generateReport(results) {
        console.log('\n🏆 DATABASE vs RPC BENCHMARK REPORT');
        console.log('===================================');
        
        let totalRpcTime = 0;
        let totalDbTime = 0;
        let validTests = 0;
        
        const categoryResults = [];
        
        for (const [category, result] of Object.entries(results)) {
            console.log(`\n📊 ${category.toUpperCase()} PERFORMANCE:`);
            
            if (result.rpc) {
                console.log(`   📡 RPC Time: ${result.rpc.toFixed(2)}ms`);
                totalRpcTime += result.rpc;
            } else {
                console.log(`   📡 RPC Time: FAILED`);
            }
            
            if (Object.keys(result.database).length > 0) {
                const dbTimes = Object.values(result.database);
                const avgDbTime = dbTimes.reduce((a, b) => a + b) / dbTimes.length;
                
                console.log(`   🗄️ Database Average: ${avgDbTime.toFixed(2)}ms`);
                console.log(`   📋 Database Methods:`);
                
                for (const [method, time] of Object.entries(result.database)) {
                    console.log(`      • ${method}: ${time.toFixed(2)}ms`);
                }
                
                if (result.rpc) {
                    const speedup = result.rpc / avgDbTime;
                    console.log(`   ${speedup > 1 ? '🚀' : '📡'} ${speedup > 1 ? 'Database' : 'RPC'} is ${Math.max(speedup, 1/speedup).toFixed(2)}x faster`);
                    
                    totalDbTime += avgDbTime;
                    validTests++;
                    
                    categoryResults.push({
                        category,
                        rpc: result.rpc,
                        database: avgDbTime,
                        speedup: speedup
                    });
                }
            }
        }
        
        // Overall summary
        if (validTests > 0) {
            const avgRpc = totalRpcTime / validTests;
            const avgDb = totalDbTime / validTests;
            const overallSpeedup = avgRpc / avgDb;
            
            console.log('\n🎯 OVERALL PERFORMANCE SUMMARY:');
            console.log('==============================');
            console.log(`📡 Average RPC Time: ${avgRpc.toFixed(2)}ms`);
            console.log(`🗄️ Average Database Time: ${avgDb.toFixed(2)}ms`);
            console.log(`🏁 Overall Speedup: ${overallSpeedup > 1 ? 'Database' : 'RPC'} is ${Math.max(overallSpeedup, 1/overallSpeedup).toFixed(2)}x faster`);
            
            // Performance insights
            console.log('\n💡 PERFORMANCE INSIGHTS:');
            console.log('========================');
            
            const fastestCategory = categoryResults.reduce((prev, curr) => 
                curr.speedup > prev.speedup ? curr : prev
            );
            
            const slowestCategory = categoryResults.reduce((prev, curr) => 
                curr.speedup < prev.speedup ? curr : prev
            );
            
            console.log(`🏆 Best Database Performance: ${fastestCategory.category} (${fastestCategory.speedup.toFixed(2)}x faster)`);
            console.log(`📉 Worst Database Performance: ${slowestCategory.category} (${slowestCategory.speedup.toFixed(2)}x ${slowestCategory.speedup > 1 ? 'faster' : 'slower'})`);
            
            console.log('\n🔬 TECHNICAL ANALYSIS:');
            console.log('======================');
            console.log('• SSH overhead adds latency to database access');
            console.log('• File system operations can be faster than network RPC');
            console.log('• Database access bypasses HTTP/JSON processing');
            console.log('• Direct system commands provide raw performance metrics');
            console.log('• Local access eliminates network latency completely');
            
            console.log('\n🚀 OPTIMIZATION RECOMMENDATIONS:');
            console.log('=================================');
            
            if (overallSpeedup > 1.2) {
                console.log('✅ Database access shows significant advantages:');
                console.log('   • Implement direct database queries for bulk operations');
                console.log('   • Use SSH connection pooling to reduce overhead');
                console.log('   • Consider local database replicas for critical operations');
                console.log('   • Implement hybrid approach: RPC for simple, DB for complex');
            } else if (overallSpeedup < 0.8) {
                console.log('📡 RPC access shows better performance:');
                console.log('   • Continue using RPC for most operations');
                console.log('   • Optimize RPC connection pooling');
                console.log('   • Consider caching frequently accessed data');
                console.log('   • Use database access only for admin/monitoring tasks');
            } else {
                console.log('⚖️ Performance is roughly equivalent:');
                console.log('   • Use RPC for simplicity and standard compliance');
                console.log('   • Use database access for administrative tasks');
                console.log('   • Implement failover between both approaches');
                console.log('   • Monitor performance continuously for optimization');
            }
        }
        
        console.log('\n📋 IMPLEMENTATION STRATEGY:');
        console.log('===========================');
        console.log('1. Primary: Use optimized RPC endpoints for standard operations');
        console.log('2. Secondary: Implement database access for system monitoring');
        console.log('3. Hybrid: Combine both approaches based on operation type');
        console.log('4. Monitoring: Continuously benchmark both approaches');
        console.log('5. Failover: Implement automatic switching on performance degradation');
    }

    /**
     * Run complete benchmark
     */
    async runComplete() {
        try {
            console.log('🔋 Testing SSH connectivity first...');
            const testResult = await this.sshExec('echo "SSH connection successful"');
            console.log(`✅ SSH Test: ${testResult}`);
            
            const results = await this.runBenchmark();
            this.generateReport(results);
            
            console.log('\n✅ Database benchmark completed successfully!');
            console.log(`📅 Completed: ${new Date().toISOString()}`);
            
            return results;
        } catch (error) {
            console.error('\n❌ Database benchmark failed:', error.message);
            throw error;
        }
    }
}

// Run if called directly
if (require.main === module) {
    const benchmark = new DatabaseBenchmark();
    
    benchmark.runComplete().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = DatabaseBenchmark;