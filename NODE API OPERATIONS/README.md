# NODE API OPERATIONS

This directory contains all BASE network node API operations and utilities for direct blockchain interaction.

## Structure

### Core API Modules
- `rpc/` - RPC endpoint handlers and utilities
- `websocket/` - WebSocket connection management
- `blockchain/` - Direct blockchain data access
- `monitoring/` - Node health and performance monitoring

### API Categories

#### 🔗 **Connection Management**
- Node connectivity testing
- RPC endpoint configuration
- WebSocket connection pooling
- Failover and redundancy handling

#### 📊 **Data Retrieval**
- Block data fetching
- Transaction analysis
- Event log monitoring
- State queries

#### ⚡ **Real-time Operations**
- Live block streaming
- Event subscriptions
- Mempool monitoring
- Transaction broadcasting

#### 🛡️ **Security & Authentication**
- API key management
- Rate limiting
- Access control
- Secure RPC calls

## Configuration

### BASE Network Endpoints
```javascript
const BASE_CONFIG = {
    rpc: {
        http: "http://localhost:8545",
        websocket: "ws://localhost:8546"
    },
    network: {
        chainId: 8453,
        name: "BASE Mainnet"
    }
};
```

### Performance Settings
```javascript
const PERFORMANCE_CONFIG = {
    timeout: 5000,
    retries: 3,
    batchSize: 100,
    concurrency: 10
};
```

## Usage Examples

### Basic RPC Call
```javascript
const api = require('./api-client');
const blockNumber = await api.getBlockNumber();
```

### WebSocket Subscription
```javascript
const ws = require('./websocket-client');
ws.subscribe('newHeads', (block) => {
    console.log('New block:', block.number);
});
```

### Batch Operations
```javascript
const batch = require('./batch-processor');
const results = await batch.getMultipleBlocks([100, 101, 102]);
```

## Monitoring & Health Checks

- Real-time node connectivity monitoring
- Performance metrics collection
- Error rate tracking
- Automatic failover capabilities

## Security Considerations

- All private keys stored in environment variables
- Rate limiting to prevent API abuse
- Input validation on all parameters
- Secure connection handling

## Integration with Trading System

This API layer provides the foundation for:
- Real-time pool detection
- Transaction monitoring
- MEV protection strategies
- High-frequency trading operations

---

**Built for BASE Network** 🔵 | **Enterprise-Grade Performance** ⚡