/**
 * BASE Network RPC Client
 * High-performance RPC interface for BASE blockchain operations
 */

const axios = require('axios');

class BaseRPCClient {
    constructor(config = {}) {
        this.config = {
            endpoint: config.endpoint || 'http://localhost:8545',
            timeout: config.timeout || 5000,
            retries: config.retries || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };
        
        this.requestId = 1;
        this.connectionHealth = {
            lastSuccessful: null,
            consecutiveFailures: 0,
            totalRequests: 0,
            totalFailures: 0
        };
    }

    /**
     * Make a raw RPC call to BASE node
     */
    async call(method, params = [], options = {}) {
        const requestConfig = {
            ...this.config,
            ...options
        };

        const payload = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: this.requestId++
        };

        let lastError;
        for (let attempt = 1; attempt <= requestConfig.retries; attempt++) {
            try {
                const startTime = Date.now();
                
                const response = await axios.post(requestConfig.endpoint, payload, {
                    timeout: requestConfig.timeout,
                    headers: {
                        'Content-Type': 'application/json',
                        'User-Agent': 'BASE-Node-API-Client/1.0'
                    }
                });

                const duration = Date.now() - startTime;
                this.updateHealthMetrics(true, duration);

                if (response.data.error) {
                    throw new Error(`RPC Error: ${response.data.error.message} (Code: ${response.data.error.code})`);
                }

                return response.data.result;

            } catch (error) {
                lastError = error;
                this.updateHealthMetrics(false);
                
                console.warn(`RPC call attempt ${attempt}/${requestConfig.retries} failed:`, error.message);
                
                if (attempt < requestConfig.retries) {
                    await this.delay(requestConfig.retryDelay * attempt);
                }
            }
        }

        throw new Error(`RPC call failed after ${requestConfig.retries} attempts: ${lastError.message}`);
    }

    /**
     * Batch multiple RPC calls for efficiency
     */
    async batchCall(calls) {
        const batchPayload = calls.map((call, index) => ({
            jsonrpc: '2.0',
            method: call.method,
            params: call.params || [],
            id: this.requestId + index
        }));

        this.requestId += calls.length;

        try {
            const response = await axios.post(this.config.endpoint, batchPayload, {
                timeout: this.config.timeout * 2, // Longer timeout for batch
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'BASE-Node-API-Client/1.0'
                }
            });

            return response.data.map(result => {
                if (result.error) {
                    throw new Error(`Batch RPC Error: ${result.error.message}`);
                }
                return result.result;
            });

        } catch (error) {
            throw new Error(`Batch RPC call failed: ${error.message}`);
        }
    }

    /**
     * Get current block number
     */
    async getBlockNumber() {
        const result = await this.call('eth_blockNumber');
        return parseInt(result, 16);
    }

    /**
     * Get block by number or hash
     */
    async getBlock(blockNumberOrHash, includeTransactions = false) {
        let blockParam;
        if (typeof blockNumberOrHash === 'number') {
            blockParam = `0x${blockNumberOrHash.toString(16)}`;
        } else if (blockNumberOrHash === 'latest' || blockNumberOrHash === 'pending') {
            blockParam = blockNumberOrHash;
        } else {
            blockParam = blockNumberOrHash;
        }

        return await this.call('eth_getBlockByNumber', [blockParam, includeTransactions]);
    }

    /**
     * Get transaction by hash
     */
    async getTransaction(hash) {
        return await this.call('eth_getTransactionByHash', [hash]);
    }

    /**
     * Get transaction receipt
     */
    async getTransactionReceipt(hash) {
        return await this.call('eth_getTransactionReceipt', [hash]);
    }

    /**
     * Get account balance
     */
    async getBalance(address, block = 'latest') {
        const result = await this.call('eth_getBalance', [address, block]);
        return BigInt(result);
    }

    /**
     * Get logs with filters
     */
    async getLogs(filter) {
        return await this.call('eth_getLogs', [filter]);
    }

    /**
     * Send raw signed transaction
     */
    async sendRawTransaction(signedTx) {
        return await this.call('eth_sendRawTransaction', [signedTx]);
    }

    /**
     * Get current gas price
     */
    async getGasPrice() {
        const result = await this.call('eth_gasPrice');
        return BigInt(result);
    }

    /**
     * Get transaction count (nonce) for address
     */
    async getTransactionCount(address, block = 'latest') {
        const result = await this.call('eth_getTransactionCount', [address, block]);
        return parseInt(result, 16);
    }

    /**
     * Estimate gas for transaction
     */
    async estimateGas(transaction) {
        const result = await this.call('eth_estimateGas', [transaction]);
        return parseInt(result, 16);
    }

    /**
     * Check node sync status
     */
    async getSyncStatus() {
        return await this.call('eth_syncing');
    }

    /**
     * Get peer count
     */
    async getPeerCount() {
        const result = await this.call('net_peerCount');
        return parseInt(result, 16);
    }

    /**
     * Get network ID
     */
    async getNetworkId() {
        return await this.call('net_version');
    }

    /**
     * Health check for the RPC connection
     */
    async healthCheck() {
        try {
            const startTime = Date.now();
            const [blockNumber, peerCount, networkId] = await this.batchCall([
                { method: 'eth_blockNumber' },
                { method: 'net_peerCount' },
                { method: 'net_version' }
            ]);

            const responseTime = Date.now() - startTime;

            return {
                healthy: true,
                responseTime,
                blockNumber: parseInt(blockNumber, 16),
                peerCount: parseInt(peerCount, 16),
                networkId,
                endpoint: this.config.endpoint,
                ...this.connectionHealth
            };
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                endpoint: this.config.endpoint,
                ...this.connectionHealth
            };
        }
    }

    /**
     * Update connection health metrics
     */
    updateHealthMetrics(success, duration = null) {
        this.connectionHealth.totalRequests++;
        
        if (success) {
            this.connectionHealth.lastSuccessful = new Date();
            this.connectionHealth.consecutiveFailures = 0;
            if (duration) {
                this.connectionHealth.averageResponseTime = 
                    ((this.connectionHealth.averageResponseTime || 0) + duration) / 2;
            }
        } else {
            this.connectionHealth.totalFailures++;
            this.connectionHealth.consecutiveFailures++;
        }
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get connection statistics
     */
    getStats() {
        const successRate = this.connectionHealth.totalRequests > 0 
            ? ((this.connectionHealth.totalRequests - this.connectionHealth.totalFailures) / this.connectionHealth.totalRequests * 100).toFixed(2)
            : 0;

        return {
            ...this.connectionHealth,
            successRate: `${successRate}%`,
            endpoint: this.config.endpoint
        };
    }
}

module.exports = BaseRPCClient;