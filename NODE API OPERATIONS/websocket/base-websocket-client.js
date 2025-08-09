/**
 * BASE Network WebSocket Client
 * Real-time blockchain event monitoring and subscription management
 */

const WebSocket = require('ws');
const EventEmitter = require('events');

class BaseWebSocketClient extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            endpoint: config.endpoint || 'ws://localhost:8546',
            reconnectInterval: config.reconnectInterval || 5000,
            maxReconnectAttempts: config.maxReconnectAttempts || 10,
            pingInterval: config.pingInterval || 30000,
            ...config
        };
        
        this.ws = null;
        this.subscriptions = new Map();
        this.requestId = 1;
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.pingTimer = null;
        this.connectionHealth = {
            connected: false,
            lastPing: null,
            lastPong: null,
            messagesReceived: 0,
            messagesSent: 0,
            reconnections: 0
        };
    }

    /**
     * Connect to BASE WebSocket endpoint
     */
    async connect() {
        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
            return;
        }

        this.isConnecting = true;
        
        try {
            this.ws = new WebSocket(this.config.endpoint);
            
            this.ws.on('open', () => {
                console.log('✅ WebSocket connected to BASE node');
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                this.connectionHealth.connected = true;
                this.startPing();
                this.emit('connected');
            });

            this.ws.on('message', (data) => {
                this.connectionHealth.messagesReceived++;
                this.handleMessage(data);
            });

            this.ws.on('close', () => {
                console.log('❌ WebSocket connection closed');
                this.connectionHealth.connected = false;
                this.stopPing();
                this.emit('disconnected');
                this.scheduleReconnect();
            });

            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
                this.emit('error', error);
            });

            this.ws.on('pong', () => {
                this.connectionHealth.lastPong = new Date();
            });

        } catch (error) {
            this.isConnecting = false;
            throw error;
        }
    }

    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        this.stopPing();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connectionHealth.connected = false;
    }

    /**
     * Send JSON-RPC request over WebSocket
     */
    async send(method, params = []) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }

        const request = {
            jsonrpc: '2.0',
            method: method,
            params: params,
            id: this.requestId++
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error(`Request timeout for ${method}`));
            }, 10000);

            const handler = (response) => {
                if (response.id === request.id) {
                    clearTimeout(timeout);
                    this.removeListener('response', handler);
                    
                    if (response.error) {
                        reject(new Error(`RPC Error: ${response.error.message}`));
                    } else {
                        resolve(response.result);
                    }
                }
            };

            this.on('response', handler);
            
            this.ws.send(JSON.stringify(request));
            this.connectionHealth.messagesSent++;
        });
    }

    /**
     * Subscribe to new block headers
     */
    async subscribeToNewHeads() {
        const subscriptionId = await this.send('eth_subscribe', ['newHeads']);
        this.subscriptions.set(subscriptionId, 'newHeads');
        
        console.log(`📡 Subscribed to new heads: ${subscriptionId}`);
        return subscriptionId;
    }

    /**
     * Subscribe to pending transactions
     */
    async subscribeToPendingTransactions() {
        const subscriptionId = await this.send('eth_subscribe', ['newPendingTransactions']);
        this.subscriptions.set(subscriptionId, 'pendingTransactions');
        
        console.log(`📡 Subscribed to pending transactions: ${subscriptionId}`);
        return subscriptionId;
    }

    /**
     * Subscribe to logs with filter
     */
    async subscribeToLogs(filter = {}) {
        const subscriptionId = await this.send('eth_subscribe', ['logs', filter]);
        this.subscriptions.set(subscriptionId, 'logs');
        
        console.log(`📡 Subscribed to logs: ${subscriptionId}`);
        return subscriptionId;
    }

    /**
     * Subscribe to DEX pool creation events
     */
    async subscribeToDEXEvents(dexSignatures = []) {
        const subscriptions = [];
        
        for (const signature of dexSignatures) {
            const filter = {
                topics: [signature]
            };
            
            const subscriptionId = await this.subscribeToLogs(filter);
            subscriptions.push({
                id: subscriptionId,
                signature: signature,
                type: 'dex_event'
            });
        }
        
        console.log(`🏪 Subscribed to ${subscriptions.length} DEX event signatures`);
        return subscriptions;
    }

    /**
     * Unsubscribe from a subscription
     */
    async unsubscribe(subscriptionId) {
        await this.send('eth_unsubscribe', [subscriptionId]);
        this.subscriptions.delete(subscriptionId);
        
        console.log(`❌ Unsubscribed: ${subscriptionId}`);
    }

    /**
     * Unsubscribe from all subscriptions
     */
    async unsubscribeAll() {
        const promises = Array.from(this.subscriptions.keys()).map(id => 
            this.unsubscribe(id)
        );
        
        await Promise.all(promises);
        console.log('❌ Unsubscribed from all subscriptions');
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            if (message.method === 'eth_subscription') {
                // Subscription notification
                const subscriptionId = message.params.subscription;
                const subscriptionType = this.subscriptions.get(subscriptionId);
                const result = message.params.result;
                
                this.emit('subscription', {
                    subscriptionId,
                    type: subscriptionType,
                    data: result
                });
                
                // Emit specific events based on subscription type
                switch (subscriptionType) {
                    case 'newHeads':
                        this.emit('newBlock', result);
                        break;
                    case 'pendingTransactions':
                        this.emit('pendingTransaction', result);
                        break;
                    case 'logs':
                        this.emit('log', result);
                        break;
                }
                
            } else if (message.id) {
                // Response to a request
                this.emit('response', message);
            }
            
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }

    /**
     * Start ping mechanism to keep connection alive
     */
    startPing() {
        this.pingTimer = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.connectionHealth.lastPing = new Date();
                this.ws.ping();
            }
        }, this.config.pingInterval);
    }

    /**
     * Stop ping mechanism
     */
    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    /**
     * Schedule reconnection attempt
     */
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            console.error(`❌ Max reconnection attempts (${this.config.maxReconnectAttempts}) reached`);
            this.emit('maxReconnectAttemptsReached');
            return;
        }

        setTimeout(() => {
            this.reconnectAttempts++;
            this.connectionHealth.reconnections++;
            
            console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts}`);
            this.connect().catch(error => {
                console.error('Reconnection failed:', error.message);
            });
        }, this.config.reconnectInterval);
    }

    /**
     * Get connection status and health metrics
     */
    getConnectionHealth() {
        return {
            ...this.connectionHealth,
            endpoint: this.config.endpoint,
            activeSubscriptions: this.subscriptions.size,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.config.maxReconnectAttempts
        };
    }

    /**
     * Health check for WebSocket connection
     */
    async healthCheck() {
        try {
            if (!this.connectionHealth.connected) {
                return {
                    healthy: false,
                    error: 'Not connected',
                    ...this.getConnectionHealth()
                };
            }

            // Test with a simple request
            const startTime = Date.now();
            await this.send('net_version');
            const responseTime = Date.now() - startTime;

            return {
                healthy: true,
                responseTime,
                ...this.getConnectionHealth()
            };
            
        } catch (error) {
            return {
                healthy: false,
                error: error.message,
                ...this.getConnectionHealth()
            };
        }
    }

    /**
     * Get list of active subscriptions
     */
    getActiveSubscriptions() {
        return Array.from(this.subscriptions.entries()).map(([id, type]) => ({
            id,
            type
        }));
    }
}

module.exports = BaseWebSocketClient;