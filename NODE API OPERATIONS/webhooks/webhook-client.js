/**
 * Webhook Client - Interact with BASE Webhook Infrastructure
 * Easy-to-use client for managing webhooks and receiving events
 */

const axios = require('axios');
const crypto = require('crypto');
const WebSocket = require('ws');
const EventEmitter = require('events');

class WebhookClient extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            serverUrl: config.serverUrl || 'http://localhost:3001',
            wsUrl: config.wsUrl || 'ws://localhost:3002',
            timeout: config.timeout || 10000,
            ...config
        };

        this.webhooks = new Map();
        this.wsClient = null;
        this.connected = false;
    }

    /**
     * Create a new webhook
     */
    async createWebhook(options) {
        const {
            url,
            events,
            name,
            description,
            filters = {},
            headers = {},
            enabled = true
        } = options;

        if (!url || !events) {
            throw new Error('URL and events are required');
        }

        try {
            const response = await axios.post(`${this.config.serverUrl}/webhooks`, {
                url,
                events,
                name,
                description,
                filters,
                headers,
                enabled
            }, {
                timeout: this.config.timeout
            });

            const webhook = response.data.webhook;
            this.webhooks.set(webhook.id, webhook);
            
            console.log(`✅ Webhook created: ${webhook.name} (${webhook.id})`);
            return webhook;
        } catch (error) {
            console.error('❌ Failed to create webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * List all webhooks
     */
    async listWebhooks() {
        try {
            const response = await axios.get(`${this.config.serverUrl}/webhooks`, {
                timeout: this.config.timeout
            });
            
            const webhooks = response.data.webhooks;
            
            // Update local cache
            this.webhooks.clear();
            webhooks.forEach(webhook => {
                this.webhooks.set(webhook.id, webhook);
            });
            
            return webhooks;
        } catch (error) {
            console.error('❌ Failed to list webhooks:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get specific webhook
     */
    async getWebhook(webhookId) {
        try {
            const response = await axios.get(`${this.config.serverUrl}/webhooks/${webhookId}`, {
                timeout: this.config.timeout
            });
            
            const webhook = response.data.webhook;
            this.webhooks.set(webhook.id, webhook);
            
            return webhook;
        } catch (error) {
            console.error('❌ Failed to get webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Update webhook
     */
    async updateWebhook(webhookId, updates) {
        try {
            const response = await axios.put(`${this.config.serverUrl}/webhooks/${webhookId}`, updates, {
                timeout: this.config.timeout
            });
            
            const webhook = response.data.webhook;
            this.webhooks.set(webhook.id, webhook);
            
            console.log(`✅ Webhook updated: ${webhook.name}`);
            return webhook;
        } catch (error) {
            console.error('❌ Failed to update webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Delete webhook
     */
    async deleteWebhook(webhookId) {
        try {
            await axios.delete(`${this.config.serverUrl}/webhooks/${webhookId}`, {
                timeout: this.config.timeout
            });
            
            this.webhooks.delete(webhookId);
            console.log(`✅ Webhook deleted: ${webhookId}`);
        } catch (error) {
            console.error('❌ Failed to delete webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Test webhook
     */
    async testWebhook(webhookId, testData = {}) {
        try {
            const response = await axios.post(`${this.config.serverUrl}/webhooks/${webhookId}/test`, {
                testData
            }, {
                timeout: this.config.timeout
            });
            
            console.log(`✅ Test webhook sent: ${webhookId}`);
            return response.data.delivery;
        } catch (error) {
            console.error('❌ Failed to test webhook:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get webhook events
     */
    async getWebhookEvents(webhookId, options = {}) {
        const { limit = 100, offset = 0 } = options;
        
        try {
            const response = await axios.get(`${this.config.serverUrl}/webhooks/${webhookId}/events`, {
                params: { limit, offset },
                timeout: this.config.timeout
            });
            
            return response.data.events;
        } catch (error) {
            console.error('❌ Failed to get webhook events:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get webhook statistics
     */
    async getWebhookStats(webhookId) {
        try {
            const response = await axios.get(`${this.config.serverUrl}/webhooks/${webhookId}/stats`, {
                timeout: this.config.timeout
            });
            
            return response.data.stats;
        } catch (error) {
            console.error('❌ Failed to get webhook stats:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get system health
     */
    async getHealth() {
        try {
            const response = await axios.get(`${this.config.serverUrl}/health`, {
                timeout: this.config.timeout
            });
            
            return response.data;
        } catch (error) {
            console.error('❌ Failed to get health:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get system statistics
     */
    async getSystemStats() {
        try {
            const response = await axios.get(`${this.config.serverUrl}/stats`, {
                timeout: this.config.timeout
            });
            
            return response.data;
        } catch (error) {
            console.error('❌ Failed to get system stats:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get recent events
     */
    async getRecentEvents(limit = 50) {
        try {
            const response = await axios.get(`${this.config.serverUrl}/events/recent`, {
                params: { limit },
                timeout: this.config.timeout
            });
            
            return response.data.events;
        } catch (error) {
            console.error('❌ Failed to get recent events:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Connect to real-time WebSocket stream
     */
    connectWebSocket() {
        if (this.wsClient) {
            console.log('⚠️ WebSocket already connected');
            return;
        }

        try {
            console.log(`🔗 Connecting to WebSocket: ${this.config.wsUrl}`);
            this.wsClient = new WebSocket(this.config.wsUrl);

            this.wsClient.on('open', () => {
                console.log('✅ WebSocket connected');
                this.connected = true;
                this.emit('connected');
            });

            this.wsClient.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleWebSocketMessage(message);
                } catch (error) {
                    console.error('❌ Failed to parse WebSocket message:', error);
                }
            });

            this.wsClient.on('close', () => {
                console.log('❌ WebSocket disconnected');
                this.connected = false;
                this.wsClient = null;
                this.emit('disconnected');
            });

            this.wsClient.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
                this.emit('error', error);
            });

        } catch (error) {
            console.error('❌ Failed to connect WebSocket:', error);
            throw error;
        }
    }

    /**
     * Disconnect WebSocket
     */
    disconnectWebSocket() {
        if (this.wsClient) {
            this.wsClient.close();
            this.wsClient = null;
            this.connected = false;
            console.log('✅ WebSocket disconnected');
        }
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(message) {
        switch (message.type) {
            case 'welcome':
                console.log(`📡 ${message.message}`);
                break;
            
            case 'event':
                this.emit('event', message.event);
                this.emit(message.event.type, message.event.data);
                break;
            
            case 'subscribed':
                console.log(`✅ Subscribed to events: ${message.events.join(', ')}`);
                break;
            
            case 'pong':
                this.emit('pong', message.timestamp);
                break;
            
            default:
                console.log('📨 WebSocket message:', message);
        }
    }

    /**
     * Subscribe to WebSocket events
     */
    subscribeToEvents(events) {
        if (!this.connected) {
            throw new Error('WebSocket not connected');
        }

        this.wsClient.send(JSON.stringify({
            type: 'subscribe',
            events: events
        }));
    }

    /**
     * Send ping to WebSocket
     */
    ping() {
        if (!this.connected) {
            throw new Error('WebSocket not connected');
        }

        this.wsClient.send(JSON.stringify({
            type: 'ping',
            timestamp: new Date().toISOString()
        }));
    }

    /**
     * Verify webhook signature (for webhook receivers)
     */
    static verifySignature(payload, signature, secret) {
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', secret)
            .update(JSON.stringify(payload))
            .digest('hex');
        
        return signature === expectedSignature;
    }

    /**
     * Create webhook receiver middleware for Express.js
     */
    static createExpressMiddleware(secret, options = {}) {
        const { 
            path = '/webhook',
            verifySignature = true,
            logger = console.log 
        } = options;

        return (req, res, next) => {
            if (req.path !== path) {
                return next();
            }

            if (verifySignature) {
                const signature = req.headers['x-webhook-signature'];
                const webhookId = req.headers['x-webhook-id'];
                
                if (!signature || !webhookId) {
                    return res.status(401).json({ error: 'Missing webhook headers' });
                }

                if (!WebhookClient.verifySignature(req.body, signature, secret)) {
                    return res.status(401).json({ error: 'Invalid signature' });
                }
            }

            logger(`📨 Webhook received: ${req.headers['x-webhook-id']}`);
            
            // Add webhook data to request
            req.webhook = {
                id: req.headers['x-webhook-id'],
                event: req.body.event,
                timestamp: req.body.timestamp
            };

            res.status(200).json({ received: true });
            next();
        };
    }

    /**
     * Helper method to create common webhook configurations
     */
    static createWebhookConfig(type, options = {}) {
        const configs = {
            newTokens: {
                events: ['tokenTransfers', 'poolCreation'],
                name: 'New Token Detection',
                description: 'Notifies when new tokens are detected',
                filters: {
                    newTokensOnly: true
                }
            },
            
            priceAlerts: {
                events: ['tokenTransfers'],
                name: 'Price Movement Alerts',
                description: 'Notifies on significant price movements',
                filters: {
                    priceChangeThreshold: options.threshold || 5
                }
            },
            
            walletActivity: {
                events: ['tokenTransfers', 'addressActivity'],
                name: 'Wallet Activity Monitor',
                description: 'Monitors specific wallet addresses',
                filters: {
                    addresses: options.addresses || []
                }
            },
            
            liquidityChanges: {
                events: ['poolCreation', 'tokenTransfers'],
                name: 'Liquidity Pool Monitor',
                description: 'Monitors liquidity pool changes',
                filters: {
                    poolAddresses: options.pools || []
                }
            },
            
            blockUpdates: {
                events: ['newBlocks'],
                name: 'Block Updates',
                description: 'Real-time block notifications',
                filters: {
                    includeTransactions: options.includeTransactions || false
                }
            }
        };

        const config = configs[type];
        if (!config) {
            throw new Error(`Unknown webhook type: ${type}`);
        }

        return {
            ...config,
            ...options
        };
    }
}

module.exports = WebhookClient;