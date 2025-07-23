#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import mysql from 'mysql2/promise';
// MySQL 连接配置
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = parseInt(process.env.MYSQL_PORT || '3306', 10);
const MYSQL_USER = process.env.MYSQL_USER || 'mcp';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || 'HKW123456';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'test';
// 校验 SQL 查询参数是否合法
const isValidSqlQueryArgs = (args) => typeof args === 'object' &&
    args !== null &&
    typeof args.query === 'string';
// 判断是否为只读查询（SELECT）
const isReadOnlyQuery = (query) => query.trim().toLowerCase().startsWith('select');
// 判断是否为创建表的查询
const isCreateTableQuery = (query) => query.trim().toLowerCase().startsWith('create table');
// 判断是否为插入数据的查询
const isInsertQuery = (query) => query.trim().toLowerCase().startsWith('insert into');
// 判断是否为更新数据的查询
const isUpdateQuery = (query) => query.trim().toLowerCase().startsWith('update');
// 判断是否为删除数据的查询
const isDeleteQuery = (query) => query.trim().toLowerCase().startsWith('delete from');
// 生成唯一事务ID用于日志
const generateTransactionId = () => randomUUID();
// MySQL 服务器主类
class MySqlServer {
    constructor() {
        // 初始化 MCP Server
        this.server = new Server({
            name: 'mysql-mcp-server',
            version: '1.0.0',
        }, {
            capabilities: {
                tools: {},
            },
        });
        // 创建 MySQL 连接池
        this.pool = mysql.createPool({
            host: MYSQL_HOST,
            port: MYSQL_PORT,
            user: MYSQL_USER,
            password: MYSQL_PASSWORD,
            database: MYSQL_DATABASE,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
        });
        // 设置工具处理器
        this.setupToolHandlers();
        // 错误处理
        this.server.onerror = (error) => console.error('[MCP Error]', error);
        process.on('SIGINT', async () => {
            await this.pool.end();
            await this.server.close();
            process.exit(0);
        });
    }
    // 注册工具请求处理器
    setupToolHandlers() {
        // 工具列表请求处理
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: 'run_sql_query',
                    description: '执行只读 SQL 查询（仅限 SELECT 语句）',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: '要执行的 SQL SELECT 查询语句',
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'create_table',
                    description: '在 MySQL 数据库中创建新表',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: '要执行的 SQL CREATE TABLE 语句',
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'insert_data',
                    description: '向 MySQL 数据库表插入数据',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: '要执行的 SQL INSERT INTO 语句',
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'update_data',
                    description: '更新 MySQL 数据库表中的数据',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: '要执行的 SQL UPDATE 语句',
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'delete_data',
                    description: '从 MySQL 数据库表中删除数据',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: '要执行的 SQL DELETE FROM 语句',
                            },
                        },
                        required: ['query'],
                    },
                },
                {
                    name: 'execute_sql',
                    description: '执行任意非 SELECT 的 SQL 语句（如 ALTER TABLE、DROP 等）',
                    inputSchema: {
                        type: 'object',
                        properties: {
                            query: {
                                type: 'string',
                                description: '要执行的 SQL 语句',
                            },
                        },
                        required: ['query'],
                    },
                },
            ],
        }));
        // 工具调用请求处理
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const transactionId = generateTransactionId();
            console.error(`[${transactionId}] 正在处理请求: ${request.params.name}`);
            // 根据工具类型分发处理
            switch (request.params.name) {
                case 'run_sql_query':
                    return this.handleReadQuery(request, transactionId);
                case 'create_table':
                    return this.handleCreateTable(request, transactionId);
                case 'insert_data':
                    return this.handleInsertData(request, transactionId);
                case 'update_data':
                    return this.handleUpdateData(request, transactionId);
                case 'delete_data':
                    return this.handleDeleteData(request, transactionId);
                case 'execute_sql':
                    return this.handleExecuteSql(request, transactionId);
                default:
                    throw new McpError(ErrorCode.MethodNotFound, `未知工具: ${request.params.name}`);
            }
        });
    }
    // 处理只读查询（SELECT）
    async handleReadQuery(request, transactionId) {
        if (!isValidSqlQueryArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'SQL 查询参数无效。');
        }
        const query = request.params.arguments.query;
        if (!isReadOnlyQuery(query)) {
            throw new McpError(ErrorCode.InvalidParams, 'run_sql_query 工具仅允许 SELECT 查询。');
        }
        console.error(`[${transactionId}] 执行 SELECT 查询: ${query}`);
        try {
            const [rows] = await this.pool.query(query);
            console.error(`[${transactionId}] 查询执行成功`);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify(rows, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            console.error(`[${transactionId}] 查询出错:`, error);
            if (error instanceof Error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `MySQL 错误: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
            throw error;
        }
    }
    // 处理 CREATE TABLE 查询
    async handleCreateTable(request, transactionId) {
        if (!isValidSqlQueryArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'SQL 查询参数无效。');
        }
        const query = request.params.arguments.query;
        if (!isCreateTableQuery(query)) {
            throw new McpError(ErrorCode.InvalidParams, 'create_table 工具仅允许 CREATE TABLE 查询。');
        }
        console.error(`[${transactionId}] 执行 CREATE TABLE 查询: ${query}`);
        try {
            const [result] = await this.pool.query(query);
            console.error(`[${transactionId}] 表创建成功`);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: '表创建成功',
                            result
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            console.error(`[${transactionId}] 查询出错:`, error);
            if (error instanceof Error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `MySQL 错误: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
            throw error;
        }
    }
    // 处理 INSERT INTO 查询
    async handleInsertData(request, transactionId) {
        if (!isValidSqlQueryArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'SQL 查询参数无效。');
        }
        const query = request.params.arguments.query;
        if (!isInsertQuery(query)) {
            throw new McpError(ErrorCode.InvalidParams, 'insert_data 工具仅允许 INSERT INTO 查询。');
        }
        console.error(`[${transactionId}] 执行 INSERT 查询: ${query}`);
        try {
            const [result] = await this.pool.query(query);
            console.error(`[${transactionId}] 数据插入成功`);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: '数据插入成功',
                            result
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            console.error(`[${transactionId}] 查询出错:`, error);
            if (error instanceof Error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `MySQL 错误: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
            throw error;
        }
    }
    // 处理 UPDATE 查询
    async handleUpdateData(request, transactionId) {
        if (!isValidSqlQueryArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'SQL 查询参数无效。');
        }
        const query = request.params.arguments.query;
        if (!isUpdateQuery(query)) {
            throw new McpError(ErrorCode.InvalidParams, 'update_data 工具仅允许 UPDATE 查询。');
        }
        console.error(`[${transactionId}] 执行 UPDATE 查询: ${query}`);
        try {
            const [result] = await this.pool.query(query);
            console.error(`[${transactionId}] 数据更新成功`);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: '数据更新成功',
                            result
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            console.error(`[${transactionId}] 查询出错:`, error);
            if (error instanceof Error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `MySQL 错误: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
            throw error;
        }
    }
    // 处理 DELETE FROM 查询
    async handleDeleteData(request, transactionId) {
        if (!isValidSqlQueryArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'SQL 查询参数无效。');
        }
        const query = request.params.arguments.query;
        if (!isDeleteQuery(query)) {
            throw new McpError(ErrorCode.InvalidParams, 'delete_data 工具仅允许 DELETE FROM 查询。');
        }
        console.error(`[${transactionId}] 执行 DELETE 查询: ${query}`);
        try {
            const [result] = await this.pool.query(query);
            console.error(`[${transactionId}] 数据删除成功`);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: '数据删除成功',
                            result
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            console.error(`[${transactionId}] 查询出错:`, error);
            if (error instanceof Error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `MySQL 错误: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
            throw error;
        }
    }
    // 启动 MCP 服务器
    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error('MySQL MCP 服务器已通过 stdio 启动');
    }
    // 处理通用 SQL 执行（非 SELECT）
    async handleExecuteSql(request, transactionId) {
        if (!isValidSqlQueryArgs(request.params.arguments)) {
            throw new McpError(ErrorCode.InvalidParams, 'SQL 查询参数无效。');
        }
        const query = request.params.arguments.query;
        if (isReadOnlyQuery(query)) {
            throw new McpError(ErrorCode.InvalidParams, 'execute_sql 工具不允许 SELECT 查询。');
        }
        console.error(`[${transactionId}] 执行通用 SQL: ${query}`);
        try {
            const [result] = await this.pool.query(query);
            console.error(`[${transactionId}] SQL 执行成功`);
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            success: true,
                            message: 'SQL 执行成功',
                            result
                        }, null, 2),
                    },
                ],
            };
        }
        catch (error) {
            console.error(`[${transactionId}] SQL 执行出错:`, error);
            if (error instanceof Error) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `MySQL 错误: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
            throw error;
        }
    }
}
// 实例化并运行服务器
const server = new MySqlServer();
server.run().catch(console.error);
