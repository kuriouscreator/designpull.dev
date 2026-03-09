#!/bin/bash

MCP_DIR="$HOME/.designpull"
PID_FILE="$MCP_DIR/mcp-server.pid"
LOG_FILE="$MCP_DIR/mcp-server.log"

mkdir -p "$MCP_DIR"

start() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p $PID > /dev/null 2>&1; then
            echo "MCP server already running (PID: $PID)"
            return 0
        fi
        rm "$PID_FILE"
    fi

    # Load .env file from current directory
    if [ -f ".env" ]; then
        export $(grep -v '^#' .env | xargs)
    fi

    echo "Starting figma-console-mcp server..."
    ENABLE_MCP_APPS=true nohup npx -y figma-console-mcp@latest >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    echo "Server started (PID: $(cat $PID_FILE))"
    echo "Logs: $LOG_FILE"
    echo "Server will listen on ws://localhost:9223"
}

stop() {
    if [ ! -f "$PID_FILE" ]; then
        echo "MCP server not running"
        return 0
    fi

    PID=$(cat "$PID_FILE")
    echo "Stopping MCP server (PID: $PID)..."
    kill $PID
    rm "$PID_FILE"
    echo "Server stopped"
}

status() {
    if [ ! -f "$PID_FILE" ]; then
        echo "MCP server is not running"
        return 1
    fi

    PID=$(cat "$PID_FILE")
    if ps -p $PID > /dev/null 2>&1; then
        echo "MCP server is running (PID: $PID)"
        return 0
    else
        echo "MCP server is not running (stale PID file)"
        rm "$PID_FILE"
        return 1
    fi
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        start
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
esac
