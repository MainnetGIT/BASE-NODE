/**
 * BASE Network Webhook Infrastructure
 * Real-time blockchain event notification system
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const BaseWebSocketClient = require('../websocket/base-websocket-client');
const BaseRPCClient = require('../rpc/base-rpc-client');
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

class WebhookServer {
    constructor(config = {}) {
        this.config = {
            port: config.port || 3001,
            wsPort: config.wsPort || 3002,
            baseRPC: config.baseRPC || 'http://localhost:8545',
            baseWS: config.baseWS || 'ws://localhost:8546',
            dataDir: config.dataDir || './webhook-data',
            secretKey: config.secretKey || crypto.randomBytes(32).toString('hex'),
            retryAttempts: config.retryAttempts || 3,
            retryDelay: config.retryDelay || 1000,
            ...config
        };

        this.app = express();
        this.webhooks = new Map();
        this.eventQueue = [];
        this.isProcessing = false;
        
        // Blockchain clients
        this.rpc = new BaseRPCClient({ endpoint: this.config.baseRPC });
        this.ws = new BaseWebSocketClient({ endpoint: this.config.baseWS });
        
        // Statistics
        this.stats = {
            webhooksCreated: 0,
            eventsProcessed: 0,
            deliveriesSuccessful: 0,
            deliveriesFailed: 0,
            startTime: new Date()
        };

        this.setupExpress();
        this.initializeDataStorage();
    }

    /**
     * Setup Express server with API endpoints
     */
    setupExpress() {
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true }));
        
        // CORS middleware
        this.app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // Webhook management endpoints
        this.app.post('/webhooks', this.createWebhook.bind(this));
        this.app.get('/webhooks', this.listWebhooks.bind(this));
        this.app.get('/webhooks/:id', this.getWebhook.bind(this));
        this.app.put('/webhooks/:id', this.updateWebhook.bind(this));
        this.app.delete('/webhooks/:id', this.deleteWebhook.bind(this));
        
        // Event management
        this.app.post('/webhooks/:id/test', this.testWebhook.bind(this));
        this.app.get('/webhooks/:id/events', this.getWebhookEvents.bind(this));
        this.app.get('/webhooks/:id/stats', this.getWebhookStats.bind(this));
        
        // System endpoints
        this.app.get('/health', this.healthCheck.bind(this));
        this.app.get('/stats', this.getSystemStats.bind(this));
        this.app.get('/events/recent', this.getRecentEvents.bind(this));
        
        // WebSocket server for real-time updates
        this.setupWebSocketServer();
    }

    /**
     * Setup WebSocket server for real-time updates
     */
    setupWebSocketServer() {
        this.wsServer = new WebSocketServer({ port: this.config.wsPort });
        this.wsClients = new Set();
        
        this.wsServer.on('connection', (ws) => {
            console.log('🔗 WebSocket client connected');
            this.wsClients.add(ws);
            
            ws.on('close', () => {
                this.wsClients.delete(ws);
                console.log('❌ WebSocket client disconnected');
            });
            
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data);
                    this.handleWebSocketMessage(ws, message);
                } catch (error) {
                    ws.send(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
            
            // Send welcome message
            ws.send(JSON.stringify({
                type: 'welcome',
                message: 'Connected to BASE Webhook Server',
                timestamp: new Date().toISOString()
            }));
        });
    }

    /**
     * Create a new webhook
     */
    async createWebhook(req, res) {
        try {
            const {
                url,
                events,
                name,
                description,
                filters = {},
                headers = {},
                enabled = true
            } = req.body;

            if (!url || !events || !Array.isArray(events)) {
                return res.status(400).json({
                    error: 'Missing required fields: url, events'
                });
            }

            const webhookId = crypto.randomUUID();
            const webhook = {
                id: webhookId,
                name: name || `Webhook-${webhookId.slice(0, 8)}`,
                description,
                url,
                events,
                filters,
                headers,
                enabled,
                secret: crypto.randomBytes(16).toString('hex'),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                stats: {
                    eventsReceived: 0,
                    deliveriesAttempted: 0,
                    deliveriesSuccessful: 0,
                    deliveriesFailed: 0,
                    lastDelivery: null,
                    lastSuccess: null,
                    lastFailure: null
                }
            };

            this.webhooks.set(webhookId, webhook);
            await this.saveWebhook(webhook);
            
            // Subscribe to blockchain events if needed
            await this.subscribeToEvents(webhook);

            this.stats.webhooksCreated++;
            
            console.log(`✅ Webhook created: ${webhook.name} (${webhookId})`);
            
            res.status(201).json({
                webhook: this.sanitizeWebhook(webhook),
                message: 'Webhook created successfully'
            });
        } catch (error) {
            console.error('❌ Failed to create webhook:', error);
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * List all webhooks
     */
    async listWebhooks(req, res) {
        try {
            const webhooks = Array.from(this.webhooks.values()).map(w => this.sanitizeWebhook(w));
            res.json({ webhooks, total: webhooks.length });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Get specific webhook
     */
    async getWebhook(req, res) {
        try {
            const webhook = this.webhooks.get(req.params.id);
            if (!webhook) {
                return res.status(404).json({ error: 'Webhook not found' });
            }
            res.json({ webhook: this.sanitizeWebhook(webhook) });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Update webhook
     */
    async updateWebhook(req, res) {
        try {
            const webhook = this.webhooks.get(req.params.id);
            if (!webhook) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            const allowedUpdates = ['url', 'events', 'name', 'description', 'filters', 'headers', 'enabled'];
            const updates = {};
            
            for (const key of allowedUpdates) {
                if (req.body[key] !== undefined) {
                    updates[key] = req.body[key];
                }
            }

            Object.assign(webhook, updates, { updatedAt: new Date().toISOString() });
            await this.saveWebhook(webhook);
            
            // Update subscriptions
            await this.subscribeToEvents(webhook);

            console.log(`✅ Webhook updated: ${webhook.name}`);
            res.json({ webhook: this.sanitizeWebhook(webhook) });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Delete webhook
     */
    async deleteWebhook(req, res) {
        try {
            const webhook = this.webhooks.get(req.params.id);
            if (!webhook) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            this.webhooks.delete(req.params.id);
            await this.deleteWebhookFile(req.params.id);

            console.log(`✅ Webhook deleted: ${webhook.name}`);
            res.json({ message: 'Webhook deleted successfully' });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Test webhook delivery
     */
    async testWebhook(req, res) {
        try {
            const webhook = this.webhooks.get(req.params.id);
            if (!webhook) {
                return res.status(404).json({ error: 'Webhook not found' });
            }

            const testEvent = {
                type: 'test',
                webhookId: webhook.id,
                data: {
                    message: 'This is a test webhook delivery',
                    timestamp: new Date().toISOString(),
                    testData: req.body.testData || {}
                },
                timestamp: new Date().toISOString()
            };

            const deliveryResult = await this.deliverWebhook(webhook, testEvent);
            
            res.json({
                message: 'Test webhook sent',
                delivery: deliveryResult
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Get webhook events
     */
    async getWebhookEvents(req, res) {
        try {
            const { limit = 100, offset = 0 } = req.query;
            // In production, this would query from a database
            const events = this.getStoredEvents(req.params.id, limit, offset);
            res.json({ events });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Get webhook statistics
     */
    async getWebhookStats(req, res) {
        try {
            const webhook = this.webhooks.get(req.params.id);
            if (!webhook) {
                return res.status(404).json({ error: 'Webhook not found' });
            }
            res.json({ stats: webhook.stats });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Health check endpoint
     */
    async healthCheck(req, res) {
        try {
            const nodeHealth = await this.rpc.healthCheck();
            const wsHealth = await this.ws.healthCheck();
            
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                webhooks: {
                    total: this.webhooks.size,
                    enabled: Array.from(this.webhooks.values()).filter(w => w.enabled).length
                },
                blockchain: {
                    rpc: nodeHealth.healthy,
                    websocket: wsHealth.healthy,
                    blockNumber: nodeHealth.blockNumber
                },
                uptime: Date.now() - this.stats.startTime.getTime()
            });
        } catch (error) {
            res.status(500).json({
                status: 'unhealthy',
                error: error.message
            });
        }
    }

    /**
     * Get system statistics
     */
    async getSystemStats(req, res) {
        try {
            res.json({
                stats: this.stats,
                webhooks: this.webhooks.size,
                queueSize: this.eventQueue.length,
                uptime: Date.now() - this.stats.startTime.getTime()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Get recent events
     */
    async getRecentEvents(req, res) {
        try {
            const { limit = 50 } = req.query;
            // Return recent events from queue
            const events = this.eventQueue.slice(-limit).reverse();
            res.json({ events });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Subscribe to blockchain events for a webhook
     */
    async subscribeToEvents(webhook) {
        for (const eventType of webhook.events) {
            switch (eventType) {
                case 'newBlocks':
                    await this.subscribeToNewBlocks(webhook);
                    break;
                case 'newTransactions':
                    await this.subscribeToNewTransactions(webhook);
                    break;
                case 'tokenTransfers':
                    await this.subscribeToTokenTransfers(webhook);
                    break;
                case 'poolCreation':
                    await this.subscribeToPoolCreation(webhook);
                    break;
                case 'addressActivity':
                    await this.subscribeToAddressActivity(webhook);
                    break;
            }
        }
    }

    /**
     * Subscribe to new blocks
     */
    async subscribeToNewBlocks(webhook) {
        if (!this.blockSubscriptionActive) {
            await this.ws.subscribeToNewHeads();
            this.blockSubscriptionActive = true;
            
            this.ws.on('newBlock', (block) => {
                this.handleNewBlockEvent(block);
            });
        }
    }

    /**
     * Subscribe to token transfers
     */
    async subscribeToTokenTransfers(webhook) {
        if (!this.transferSubscriptionActive) {
            const transferSignature = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
            await this.ws.subscribeToLogs({ topics: [transferSignature] });
            this.transferSubscriptionActive = true;
            
            this.ws.on('log', (log) => {
                if (log.topics[0] === transferSignature) {
                    this.handleTokenTransferEvent(log);
                }
            });
        }
    }

    /**
     * Handle new block events
     */
    handleNewBlockEvent(block) {
        const event = {
            type: 'newBlock',
            data: {
                blockNumber: parseInt(block.number, 16),
                blockHash: block.hash,
                timestamp: new Date(parseInt(block.timestamp, 16) * 1000).toISOString(),
                transactionCount: block.transactions.length,
                gasUsed: parseInt(block.gasUsed, 16),
                gasLimit: parseInt(block.gasLimit, 16)
            },
            timestamp: new Date().toISOString()
        };

        this.queueEvent(event, 'newBlocks');
    }

    /**
     * Handle token transfer events
     */
    handleTokenTransferEvent(log) {
        const event = {
            type: 'tokenTransfer',
            data: {
                contractAddress: log.address,
                from: '0x' + log.topics[1].slice(26),
                to: '0x' + log.topics[2].slice(26),
                value: BigInt(log.data || '0x0').toString(),
                blockNumber: parseInt(log.blockNumber, 16),
                transactionHash: log.transactionHash,
                logIndex: parseInt(log.logIndex, 16)
            },
            timestamp: new Date().toISOString()
        };

        this.queueEvent(event, 'tokenTransfers');
    }

    /**
     * Queue event for processing
     */
    queueEvent(event, eventType) {
        this.eventQueue.push({ ...event, eventType });
        this.stats.eventsProcessed++;
        
        // Broadcast to WebSocket clients
        this.broadcastToWebSocketClients({
            type: 'event',
            event
        });
        
        // Process webhook deliveries
        this.processEventQueue();
    }

    /**
     * Process event queue
     */
    async processEventQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            while (this.eventQueue.length > 0) {
                const queuedEvent = this.eventQueue.shift();
                await this.processEvent(queuedEvent);
            }
        } catch (error) {
            console.error('❌ Error processing event queue:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Process individual event
     */
    async processEvent(queuedEvent) {
        const relevantWebhooks = Array.from(this.webhooks.values()).filter(webhook => 
            webhook.enabled && webhook.events.includes(queuedEvent.eventType)
        );

        const deliveryPromises = relevantWebhooks.map(webhook => 
            this.deliverWebhook(webhook, queuedEvent)
        );

        await Promise.allSettled(deliveryPromises);
    }

    /**
     * Deliver webhook
     */
    async deliverWebhook(webhook, event) {
        const payload = {
            webhookId: webhook.id,
            event: event,
            timestamp: new Date().toISOString()
        };

        const signature = this.generateSignature(payload, webhook.secret);
        
        const headers = {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
            'X-Webhook-ID': webhook.id,
            'User-Agent': 'BASE-Webhook-Server/1.0',
            ...webhook.headers
        };

        webhook.stats.deliveriesAttempted++;
        webhook.stats.lastDelivery = new Date().toISOString();

        for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
            try {
                const response = await axios.post(webhook.url, payload, {
                    headers,
                    timeout: 10000,
                    validateStatus: (status) => status >= 200 && status < 300
                });

                webhook.stats.deliveriesSuccessful++;
                webhook.stats.lastSuccess = new Date().toISOString();
                this.stats.deliveriesSuccessful++;

                console.log(`✅ Webhook delivered: ${webhook.name} (attempt ${attempt})`);
                
                return {
                    success: true,
                    attempt,
                    status: response.status,
                    responseTime: response.headers['response-time']
                };

            } catch (error) {
                console.warn(`⚠️ Webhook delivery failed: ${webhook.name} (attempt ${attempt}):`, error.message);
                
                if (attempt === this.config.retryAttempts) {
                    webhook.stats.deliveriesFailed++;
                    webhook.stats.lastFailure = new Date().toISOString();
                    this.stats.deliveriesFailed++;
                    
                    return {
                        success: false,
                        attempts: attempt,
                        error: error.message
                    };
                }
                
                await this.sleep(this.config.retryDelay * attempt);
            }
        }
    }

    /**
     * Generate webhook signature
     */
    generateSignature(payload, secret) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(JSON.stringify(payload));
        return 'sha256=' + hmac.digest('hex');
    }

    /**
     * Broadcast message to WebSocket clients
     */
    broadcastToWebSocketClients(message) {
        this.wsClients.forEach(client => {
            try {
                client.send(JSON.stringify(message));
            } catch (error) {
                console.warn('Failed to send WebSocket message:', error.message);
            }
        });
    }

    /**
     * Handle WebSocket messages
     */
    handleWebSocketMessage(ws, message) {
        switch (message.type) {
            case 'subscribe':
                // Handle subscription requests
                ws.send(JSON.stringify({ type: 'subscribed', events: message.events }));
                break;
            case 'ping':
                ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
                break;
            default:
                ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        }
    }

    /**
     * Data storage methods
     */
    async initializeDataStorage() {
        try {
            await fs.mkdir(this.config.dataDir, { recursive: true });
            await this.loadWebhooks();
        } catch (error) {
            console.error('❌ Failed to initialize data storage:', error);
        }
    }

    async loadWebhooks() {
        try {
            const files = await fs.readdir(this.config.dataDir);
            const webhookFiles = files.filter(f => f.startsWith('webhook-') && f.endsWith('.json'));
            
            for (const file of webhookFiles) {
                const data = await fs.readFile(path.join(this.config.dataDir, file), 'utf8');
                const webhook = JSON.parse(data);
                this.webhooks.set(webhook.id, webhook);
            }
            
            console.log(`📄 Loaded ${webhookFiles.length} webhooks from storage`);
        } catch (error) {
            console.warn('⚠️ Failed to load webhooks:', error.message);
        }
    }

    async saveWebhook(webhook) {
        try {
            const filename = `webhook-${webhook.id}.json`;
            const filepath = path.join(this.config.dataDir, filename);
            await fs.writeFile(filepath, JSON.stringify(webhook, null, 2));
        } catch (error) {
            console.error('❌ Failed to save webhook:', error);
        }
    }

    async deleteWebhookFile(webhookId) {
        try {
            const filename = `webhook-${webhookId}.json`;
            const filepath = path.join(this.config.dataDir, filename);
            await fs.unlink(filepath);
        } catch (error) {
            console.warn('⚠️ Failed to delete webhook file:', error.message);
        }
    }

    /**
     * Utility methods
     */
    sanitizeWebhook(webhook) {
        const { secret, ...sanitized } = webhook;
        return sanitized;
    }

    getStoredEvents(webhookId, limit, offset) {
        // In production, this would query from a database
        return [];
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Start the webhook server
     */
    async start() {
        try {
            // Connect to blockchain
            await this.ws.connect();
            console.log('✅ Connected to BASE WebSocket');

            // Start HTTP server
            this.server = this.app.listen(this.config.port, () => {
                console.log(`🚀 Webhook Server running on port ${this.config.port}`);
                console.log(`📡 WebSocket Server running on port ${this.config.wsPort}`);
                console.log(`🔗 API Base URL: http://localhost:${this.config.port}`);
                console.log(`🌐 WebSocket URL: ws://localhost:${this.config.wsPort}`);
            });

            // Setup graceful shutdown
            process.on('SIGINT', () => this.stop());
            process.on('SIGTERM', () => this.stop());

        } catch (error) {
            console.error('❌ Failed to start webhook server:', error);
            process.exit(1);
        }
    }

    /**
     * Stop the webhook server
     */
    async stop() {
        console.log('🛑 Stopping webhook server...');
        
        if (this.server) {
            this.server.close();
        }
        
        if (this.wsServer) {
            this.wsServer.close();
        }
        
        if (this.ws) {
            this.ws.disconnect();
        }
        
        console.log('✅ Webhook server stopped');
        process.exit(0);
    }
}

module.exports = WebhookServer;