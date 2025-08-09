/**
 * NODE Health Monitor
 * Comprehensive monitoring system for BASE node health and performance
 */

const BaseRPCClient = require('../rpc/base-rpc-client');
const BaseWebSocketClient = require('../websocket/base-websocket-client');
const EventEmitter = require('events');

class NodeHealthMonitor extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            rpcEndpoint: config.rpcEndpoint || 'http://localhost:8545',
            wsEndpoint: config.wsEndpoint || 'ws://localhost:8546',
            checkInterval: config.checkInterval || 30000, // 30 seconds
            alertThresholds: {
                responseTime: config.alertThresholds?.responseTime || 1000, // 1 second
                blockDelay: config.alertThresholds?.blockDelay || 300, // 5 minutes
                peerCount: config.alertThresholds?.peerCount || 10,
                successRate: config.alertThresholds?.successRate || 95, // percentage
                ...config.alertThresholds
            },
            ...config
        };

        this.rpc = new BaseRPCClient({ endpoint: this.config.rpcEndpoint });
        this.ws = new BaseWebSocketClient({ endpoint: this.config.wsEndpoint });
        
        this.monitoring = false;
        this.lastBlockTime = null;
        this.lastBlockNumber = null;
        this.monitoringInterval = null;
        
        this.metrics = {
            rpc: {
                totalChecks: 0,
                successfulChecks: 0,
                averageResponseTime: 0,
                lastCheck: null,
                lastError: null
            },
            websocket: {
                totalChecks: 0,
                successfulChecks: 0,
                averageResponseTime: 0,
                lastCheck: null,
                lastError: null,
                subscriptions: 0
            },
            blockchain: {
                lastBlockNumber: null,
                lastBlockTime: null,
                averageBlockTime: 0,
                peerCount: 0,
                networkId: null,
                syncStatus: null
            },
            alerts: []
        };
    }

    /**
     * Start monitoring BASE node health
     */
    async startMonitoring() {
        if (this.monitoring) {
            console.log('⚠️  Monitoring already active');
            return;
        }

        console.log('🏥 Starting BASE node health monitoring...');
        this.monitoring = true;

        try {
            // Initial health check
            await this.performFullHealthCheck();
            
            // Set up WebSocket monitoring
            await this.setupWebSocketMonitoring();
            
            // Start periodic health checks
            this.monitoringInterval = setInterval(() => {
                this.performFullHealthCheck().catch(error => {
                    console.error('❌ Health check error:', error.message);
                });
            }, this.config.checkInterval);

            console.log(`✅ Health monitoring active (checking every ${this.config.checkInterval/1000}s)`);
            this.emit('monitoringStarted');

        } catch (error) {
            console.error('❌ Failed to start monitoring:', error.message);
            this.monitoring = false;
            throw error;
        }
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        console.log('🛑 Stopping health monitoring...');
        
        this.monitoring = false;
        
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        
        if (this.ws) {
            this.ws.disconnect();
        }
        
        console.log('✅ Health monitoring stopped');
        this.emit('monitoringStopped');
    }

    /**
     * Perform comprehensive health check
     */
    async performFullHealthCheck() {
        const checkStartTime = Date.now();
        
        try {
            // RPC Health Check
            const rpcHealth = await this.checkRPCHealth();
            
            // WebSocket Health Check
            const wsHealth = await this.checkWebSocketHealth();
            
            // Blockchain Status Check
            const blockchainHealth = await this.checkBlockchainHealth();
            
            // Update metrics
            this.updateMetrics(rpcHealth, wsHealth, blockchainHealth);
            
            // Check for alerts
            this.checkAlertConditions(rpcHealth, wsHealth, blockchainHealth);
            
            const totalCheckTime = Date.now() - checkStartTime;
            
            const healthReport = {
                timestamp: new Date(),
                totalCheckTime,
                rpc: rpcHealth,
                websocket: wsHealth,
                blockchain: blockchainHealth,
                overall: this.calculateOverallHealth(rpcHealth, wsHealth, blockchainHealth)
            };
            
            this.emit('healthCheck', healthReport);
            return healthReport;
            
        } catch (error) {
            console.error('❌ Health check failed:', error.message);
            this.emit('healthCheckFailed', error);
            throw error;
        }
    }

    /**
     * Check RPC endpoint health
     */
    async checkRPCHealth() {
        const startTime = Date.now();
        
        try {
            const health = await this.rpc.healthCheck();
            const responseTime = Date.now() - startTime;
            
            this.metrics.rpc.totalChecks++;
            this.metrics.rpc.lastCheck = new Date();
            
            if (health.healthy) {
                this.metrics.rpc.successfulChecks++;
                this.metrics.rpc.averageResponseTime = 
                    (this.metrics.rpc.averageResponseTime + responseTime) / 2;
            } else {
                this.metrics.rpc.lastError = health.error;
            }
            
            return {
                healthy: health.healthy,
                responseTime,
                blockNumber: health.blockNumber,
                peerCount: health.peerCount,
                networkId: health.networkId,
                error: health.error
            };
            
        } catch (error) {
            this.metrics.rpc.totalChecks++;
            this.metrics.rpc.lastError = error.message;
            
            return {
                healthy: false,
                responseTime: Date.now() - startTime,
                error: error.message
            };
        }
    }

    /**
     * Check WebSocket connection health
     */
    async checkWebSocketHealth() {
        const startTime = Date.now();
        
        try {
            const health = await this.ws.healthCheck();
            const responseTime = Date.now() - startTime;
            
            this.metrics.websocket.totalChecks++;
            this.metrics.websocket.lastCheck = new Date();
            
            if (health.healthy) {
                this.metrics.websocket.successfulChecks++;
                this.metrics.websocket.averageResponseTime = 
                    (this.metrics.websocket.averageResponseTime + responseTime) / 2;
            } else {
                this.metrics.websocket.lastError = health.error;
            }
            
            this.metrics.websocket.subscriptions = health.activeSubscriptions;
            
            return {
                healthy: health.healthy,
                responseTime,
                connected: health.connected,
                subscriptions: health.activeSubscriptions,
                reconnections: health.reconnections,
                error: health.error
            };
            
        } catch (error) {
            this.metrics.websocket.totalChecks++;
            this.metrics.websocket.lastError = error.message;
            
            return {
                healthy: false,
                responseTime: Date.now() - startTime,
                connected: false,
                error: error.message
            };
        }
    }

    /**
     * Check blockchain status and sync
     */
    async checkBlockchainHealth() {
        try {
            const [blockNumber, syncStatus, peerCount] = await this.rpc.batchCall([
                { method: 'eth_blockNumber' },
                { method: 'eth_syncing' },
                { method: 'net_peerCount' }
            ]);
            
            const currentBlockNumber = parseInt(blockNumber, 16);
            const currentTime = Date.now();
            const peerCountNum = parseInt(peerCount, 16);
            
            // Calculate block timing
            let blockDelay = null;
            let averageBlockTime = null;
            
            if (this.lastBlockNumber && this.lastBlockTime) {
                if (currentBlockNumber > this.lastBlockNumber) {
                    const timeDiff = currentTime - this.lastBlockTime;
                    const blockDiff = currentBlockNumber - this.lastBlockNumber;
                    averageBlockTime = timeDiff / blockDiff;
                    
                    this.metrics.blockchain.averageBlockTime = 
                        (this.metrics.blockchain.averageBlockTime + averageBlockTime) / 2;
                } else {
                    blockDelay = currentTime - this.lastBlockTime;
                }
            }
            
            this.lastBlockNumber = currentBlockNumber;
            this.lastBlockTime = currentTime;
            
            this.metrics.blockchain.lastBlockNumber = currentBlockNumber;
            this.metrics.blockchain.lastBlockTime = new Date(currentTime);
            this.metrics.blockchain.peerCount = peerCountNum;
            this.metrics.blockchain.syncStatus = syncStatus;
            
            return {
                blockNumber: currentBlockNumber,
                syncing: syncStatus !== false,
                peerCount: peerCountNum,
                blockDelay,
                averageBlockTime: this.metrics.blockchain.averageBlockTime
            };
            
        } catch (error) {
            return {
                healthy: false,
                error: error.message
            };
        }
    }

    /**
     * Set up WebSocket monitoring for real-time events
     */
    async setupWebSocketMonitoring() {
        try {
            await this.ws.connect();
            
            // Subscribe to new blocks for real-time monitoring
            await this.ws.subscribeToNewHeads();
            
            this.ws.on('newBlock', (block) => {
                const blockNumber = parseInt(block.number, 16);
                console.log(`📦 New block: ${blockNumber}`);
                
                this.emit('newBlock', {
                    number: blockNumber,
                    timestamp: new Date(parseInt(block.timestamp, 16) * 1000),
                    transactionCount: block.transactions.length,
                    gasUsed: parseInt(block.gasUsed, 16)
                });
            });
            
            this.ws.on('disconnected', () => {
                this.addAlert('websocket_disconnected', 'WebSocket connection lost', 'warning');
            });
            
            this.ws.on('connected', () => {
                this.clearAlert('websocket_disconnected');
            });
            
        } catch (error) {
            console.warn('⚠️  WebSocket monitoring setup failed:', error.message);
        }
    }

    /**
     * Check for alert conditions
     */
    checkAlertConditions(rpcHealth, wsHealth, blockchainHealth) {
        const thresholds = this.config.alertThresholds;
        
        // RPC response time alert
        if (rpcHealth.responseTime > thresholds.responseTime) {
            this.addAlert('slow_rpc', 
                `RPC response time (${rpcHealth.responseTime}ms) exceeds threshold (${thresholds.responseTime}ms)`, 
                'warning'
            );
        } else {
            this.clearAlert('slow_rpc');
        }
        
        // WebSocket response time alert
        if (wsHealth.responseTime > thresholds.responseTime) {
            this.addAlert('slow_websocket', 
                `WebSocket response time (${wsHealth.responseTime}ms) exceeds threshold (${thresholds.responseTime}ms)`, 
                'warning'
            );
        } else {
            this.clearAlert('slow_websocket');
        }
        
        // Peer count alert
        if (blockchainHealth.peerCount < thresholds.peerCount) {
            this.addAlert('low_peers', 
                `Peer count (${blockchainHealth.peerCount}) below threshold (${thresholds.peerCount})`, 
                'warning'
            );
        } else {
            this.clearAlert('low_peers');
        }
        
        // Sync status alert
        if (blockchainHealth.syncing) {
            this.addAlert('node_syncing', 'Node is syncing (not fully caught up)', 'info');
        } else {
            this.clearAlert('node_syncing');
        }
        
        // Block delay alert
        if (blockchainHealth.blockDelay && blockchainHealth.blockDelay > thresholds.blockDelay * 1000) {
            this.addAlert('block_delay', 
                `Block delay (${Math.round(blockchainHealth.blockDelay/1000)}s) exceeds threshold (${thresholds.blockDelay}s)`, 
                'critical'
            );
        } else {
            this.clearAlert('block_delay');
        }
    }

    /**
     * Add an alert
     */
    addAlert(id, message, severity = 'info') {
        const existingAlert = this.metrics.alerts.find(alert => alert.id === id);
        
        if (!existingAlert) {
            const alert = {
                id,
                message,
                severity,
                timestamp: new Date(),
                count: 1
            };
            
            this.metrics.alerts.push(alert);
            console.log(`🚨 ${severity.toUpperCase()}: ${message}`);
            this.emit('alert', alert);
        } else {
            existingAlert.count++;
            existingAlert.timestamp = new Date();
        }
    }

    /**
     * Clear an alert
     */
    clearAlert(id) {
        const alertIndex = this.metrics.alerts.findIndex(alert => alert.id === id);
        if (alertIndex !== -1) {
            const alert = this.metrics.alerts[alertIndex];
            this.metrics.alerts.splice(alertIndex, 1);
            console.log(`✅ Alert cleared: ${alert.message}`);
            this.emit('alertCleared', alert);
        }
    }

    /**
     * Calculate overall health score
     */
    calculateOverallHealth(rpcHealth, wsHealth, blockchainHealth) {
        let score = 100;
        
        if (!rpcHealth.healthy) score -= 40;
        if (!wsHealth.healthy) score -= 30;
        if (blockchainHealth.syncing) score -= 20;
        if (blockchainHealth.peerCount < 5) score -= 10;
        
        let status = 'healthy';
        if (score < 60) status = 'critical';
        else if (score < 80) status = 'warning';
        
        return {
            score: Math.max(0, score),
            status,
            activeAlerts: this.metrics.alerts.length
        };
    }

    /**
     * Update internal metrics
     */
    updateMetrics(rpcHealth, wsHealth, blockchainHealth) {
        // Update is handled in individual check methods
    }

    /**
     * Get current health summary
     */
    getHealthSummary() {
        const rpcSuccessRate = this.metrics.rpc.totalChecks > 0 
            ? (this.metrics.rpc.successfulChecks / this.metrics.rpc.totalChecks * 100).toFixed(2)
            : 0;
            
        const wsSuccessRate = this.metrics.websocket.totalChecks > 0 
            ? (this.metrics.websocket.successfulChecks / this.metrics.websocket.totalChecks * 100).toFixed(2)
            : 0;

        return {
            monitoring: this.monitoring,
            uptime: this.monitoring ? Date.now() - (this.metrics.rpc.lastCheck?.getTime() || Date.now()) : 0,
            rpc: {
                successRate: `${rpcSuccessRate}%`,
                averageResponseTime: `${Math.round(this.metrics.rpc.averageResponseTime)}ms`,
                totalChecks: this.metrics.rpc.totalChecks,
                lastCheck: this.metrics.rpc.lastCheck,
                lastError: this.metrics.rpc.lastError
            },
            websocket: {
                successRate: `${wsSuccessRate}%`,
                averageResponseTime: `${Math.round(this.metrics.websocket.averageResponseTime)}ms`,
                subscriptions: this.metrics.websocket.subscriptions,
                totalChecks: this.metrics.websocket.totalChecks,
                lastCheck: this.metrics.websocket.lastCheck,
                lastError: this.metrics.websocket.lastError
            },
            blockchain: {
                ...this.metrics.blockchain,
                averageBlockTime: `${Math.round(this.metrics.blockchain.averageBlockTime/1000)}s`
            },
            alerts: this.metrics.alerts
        };
    }

    /**
     * Export metrics for external monitoring systems
     */
    exportMetrics() {
        return {
            timestamp: new Date().toISOString(),
            ...this.getHealthSummary()
        };
    }
}

module.exports = NodeHealthMonitor;