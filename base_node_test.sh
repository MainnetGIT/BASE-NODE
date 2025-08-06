#!/bin/bash

# BASE Network Node Health & Slot Tests
# Server: 185.191.117.142
# RPC: http://localhost:8545 (BASE Mainnet - Chain ID 8453)
# Metrics: http://localhost:7300

echo "🚀 Starting BASE Network Node Tests"
echo "📡 RPC Endpoint: http://localhost:8545"
echo "📊 Metrics: http://localhost:7300"
echo "⏰ $(date)"
echo "======================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test function
test_rpc() {
    local method=$1
    local params=$2
    local description=$3
    
    echo -e "\n${BLUE}Testing: $description${NC}"
    
    local payload="{\"jsonrpc\":\"2.0\",\"method\":\"$method\",\"params\":[$params],\"id\":1}"
    local start_time=$(date +%s%3N)
    
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        --connect-timeout 10 \
        --max-time 30 \
        -d "$payload" \
        http://localhost:8545)
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    if [[ $? -eq 0 && ! -z "$response" ]]; then
        # Check if response contains error
        if echo "$response" | grep -q '"error"'; then
            echo -e "   ${RED}❌ Failed: $(echo "$response" | grep -o '"message":"[^"]*"')${NC}"
            echo -e "   ⏱️  Response time: ${duration}ms"
            return 1
        else
            local result=$(echo "$response" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
            if [[ -z "$result" ]]; then
                result=$(echo "$response" | grep -o '"result":[^,}]*' | cut -d':' -f2)
            fi
            echo -e "   ${GREEN}✅ Success: $result${NC}"
            echo -e "   ⏱️  Response time: ${duration}ms"
            return 0
        fi
    else
        echo -e "   ${RED}❌ Connection failed${NC}"
        return 1
    fi
}

# Test function for block data
test_block() {
    local block_param=$1
    local description=$2
    
    echo -e "\n${BLUE}Testing: $description${NC}"
    
    local payload="{\"jsonrpc\":\"2.0\",\"method\":\"eth_getBlockByNumber\",\"params\":[\"$block_param\",false],\"id\":1}"
    local start_time=$(date +%s%3N)
    
    local response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        --connect-timeout 10 \
        --max-time 30 \
        -d "$payload" \
        http://localhost:8545)
    
    local end_time=$(date +%s%3N)
    local duration=$((end_time - start_time))
    
    if [[ $? -eq 0 && ! -z "$response" ]]; then
        if echo "$response" | grep -q '"error"'; then
            echo -e "   ${RED}❌ Failed: $(echo "$response" | grep -o '"message":"[^"]*"')${NC}"
            return 1
        else
            # Extract block data
            local block_hash=$(echo "$response" | grep -o '"hash":"[^"]*"' | cut -d'"' -f4)
            local block_number=$(echo "$response" | grep -o '"number":"[^"]*"' | cut -d'"' -f4)
            local timestamp=$(echo "$response" | grep -o '"timestamp":"[^"]*"' | cut -d'"' -f4)
            local gas_used=$(echo "$response" | grep -o '"gasUsed":"[^"]*"' | cut -d'"' -f4)
            
            if [[ ! -z "$block_number" ]]; then
                local block_num_dec=$((16#${block_number#0x}))
                echo -e "   ${GREEN}✅ Block Number: $block_num_dec ($block_number)${NC}"
                echo -e "   ${GREEN}✅ Block Hash: $block_hash${NC}"
                if [[ ! -z "$timestamp" ]]; then
                    local timestamp_dec=$((16#${timestamp#0x}))
                    local readable_time=$(date -d "@$timestamp_dec" 2>/dev/null || echo "N/A")
                    echo -e "   ${GREEN}✅ Timestamp: $readable_time${NC}"
                fi
                if [[ ! -z "$gas_used" ]]; then
                    local gas_dec=$((16#${gas_used#0x}))
                    echo -e "   ${GREEN}✅ Gas Used: $(printf "%'d" $gas_dec)${NC}"
                fi
            fi
            echo -e "   ⏱️  Response time: ${duration}ms"
            return 0
        fi
    else
        echo -e "   ${RED}❌ Connection failed${NC}"
        return 1
    fi
}

# 1. HEALTH TESTS
echo -e "\n🔍 Running BASE Node Health Tests..."

# Test Chain ID
test_rpc "eth_chainId" "" "Chain ID"

# Test Network Version
test_rpc "net_version" "" "Network Version"

# Test Peer Count
test_rpc "net_peerCount" "" "Peer Count"

# Test Sync Status
test_rpc "eth_syncing" "" "Sync Status"

# Test Latest Block Number
echo -e "\n🎰 Running BASE Node Slot/Block Tests..."
test_rpc "eth_blockNumber" "" "Latest Block Number"

# Get latest block number for further tests
latest_block_response=$(curl -s -X POST \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    http://localhost:8545)

if echo "$latest_block_response" | grep -q '"result"'; then
    latest_block_hex=$(echo "$latest_block_response" | grep -o '"result":"[^"]*"' | cut -d'"' -f4)
    latest_block_dec=$((16#${latest_block_hex#0x}))
    
    # Test Latest Block Details
    test_block "latest" "Latest Block Details"
    
    # Test Previous Block
    prev_block_dec=$((latest_block_dec - 1))
    prev_block_hex="0x$(printf "%x" $prev_block_dec)"
    test_block "$prev_block_hex" "Previous Block"
    
    # Test Block Range (last 3 blocks)
    echo -e "\n${BLUE}Testing: Block Range (last 3 blocks)${NC}"
    success_count=0
    for i in {0..2}; do
        test_block_dec=$((latest_block_dec - i))
        test_block_hex="0x$(printf "%x" $test_block_dec)"
        if test_block "$test_block_hex" "Block $test_block_dec" > /dev/null 2>&1; then
            ((success_count++))
        fi
    done
    echo -e "   ${GREEN}✅ Retrieved $success_count/3 blocks successfully${NC}"
fi

# 2. PERFORMANCE TESTS
echo -e "\n⚡ Running Performance Tests..."

echo -e "\n${BLUE}Testing: Rapid Fire Requests (5x eth_blockNumber)${NC}"
total_time=0
success_count=0

for i in {1..5}; do
    start_time=$(date +%s%3N)
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        --connect-timeout 5 \
        --max-time 10 \
        -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":'$i'}' \
        http://localhost:8545)
    end_time=$(date +%s%3N)
    duration=$((end_time - start_time))
    total_time=$((total_time + duration))
    
    if [[ $? -eq 0 && ! -z "$response" ]] && ! echo "$response" | grep -q '"error"'; then
        ((success_count++))
    fi
done

avg_time=$((total_time / 5))
echo -e "   ${GREEN}✅ Completed $success_count/5 requests${NC}"
echo -e "   📊 Average response time: ${avg_time}ms"
echo -e "   📊 Total time: ${total_time}ms"

# 3. METRICS TEST
echo -e "\n📊 Testing Metrics Endpoint..."
start_time=$(date +%s%3N)
metrics_response=$(curl -s --connect-timeout 5 --max-time 10 http://localhost:7300)
end_time=$(date +%s%3N)
duration=$((end_time - start_time))

if [[ $? -eq 0 && ! -z "$metrics_response" ]]; then
    metrics_count=$(echo "$metrics_response" | grep -c "^[^#].*[0-9]$")
    echo -e "   ${GREEN}✅ Metrics endpoint accessible${NC}"
    echo -e "   📊 Total metrics: $metrics_count"
    echo -e "   ⏱️  Response time: ${duration}ms"
    
    # Check for key metrics
    if echo "$metrics_response" | grep -q "op_node_default_up 1"; then
        echo -e "   ${GREEN}✅ Node is up and running${NC}"
    fi
    if echo "$metrics_response" | grep -q "process_cpu_seconds_total"; then
        cpu_time=$(echo "$metrics_response" | grep "process_cpu_seconds_total" | awk '{print $2}')
        echo -e "   ${GREEN}✅ CPU time: ${cpu_time}s${NC}"
    fi
    if echo "$metrics_response" | grep -q "process_resident_memory_bytes"; then
        memory=$(echo "$metrics_response" | grep "process_resident_memory_bytes" | awk '{print $2}')
        memory_mb=$((memory / 1024 / 1024))
        echo -e "   ${GREEN}✅ Memory usage: ${memory_mb}MB${NC}"
    fi
else
    echo -e "   ${RED}❌ Metrics endpoint failed${NC}"
fi

# 4. GENERATE REPORT
echo -e "\n======================================="
echo -e "📋 BASE NODE TEST REPORT"
echo -e "======================================="

echo -e "\n🏥 HEALTH STATUS:"
echo -e "   Chain ID: $(test_rpc "eth_chainId" "" "Chain ID Check" | grep -q "✅" && echo "✅ PASSED" || echo "❌ FAILED")"
echo -e "   Network: $(test_rpc "net_version" "" "Network Check" | grep -q "✅" && echo "✅ PASSED" || echo "❌ FAILED")"
echo -e "   Peers: $(test_rpc "net_peerCount" "" "Peer Check" | grep -q "✅" && echo "✅ PASSED" || echo "❌ FAILED")"
echo -e "   Sync: $(test_rpc "eth_syncing" "" "Sync Check" | grep -q "✅" && echo "✅ PASSED" || echo "❌ FAILED")"

echo -e "\n🎰 BLOCK/SLOT STATUS:"
echo -e "   Latest Block: $(test_rpc "eth_blockNumber" "" "Block Check" | grep -q "✅" && echo "✅ PASSED" || echo "❌ FAILED")"
echo -e "   Block Details: ✅ TESTED"
echo -e "   Block Range: ✅ TESTED"

echo -e "\n⚡ PERFORMANCE:"
echo -e "   Rapid Fire: $success_count/5 requests successful"
echo -e "   Metrics: $(echo "$metrics_response" | grep -q "op_node_default_up" && echo "✅ ACCESSIBLE" || echo "❌ FAILED")"

echo -e "\n💾 Test completed at: $(date)"
echo -e "🔧 Server: 185.191.117.142"
echo -e "📡 RPC: http://localhost:8545"
echo -e "=======================================" 