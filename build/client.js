import { Client } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StdioClientTransport } from '../node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
async function main() {
    try {
        // 创建客户端
        const client = new Client({
            name: 'mysql-mcp-client',
            version: '1.0.0'
        });
        // 配置连接
        const transport = new StdioClientTransport({
            command: '/opt/homebrew/bin/node',
            args: [path.resolve(__dirname, '../build/index.js')],
            env: {
                MYSQL_HOST: 'localhost',
                MYSQL_PORT: '3306',
                MYSQL_USER: 'mcp',
                MYSQL_PASSWORD: 'HKW123456',
                MYSQL_DATABASE: 'test'
            }
        });
        // 连接到服务器
        console.log('正在连接到 MySQL MCP 服务器...');
        await client.connect(transport);
        console.log('连接成功！');
        // 测试查询
        console.log('\n执行测试查询...');
        const createTableResponse = await client.callTool({
            name: 'execute_sql',
            arguments: {
                query: `
          CREATE TABLE IF NOT EXISTS test_users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(100),
            email VARCHAR(100),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `
            }
        });
        console.log('创建表结果:', createTableResponse);
        // 插入测试数据
        console.log('\n插入测试数据...');
        const insertResponse = await client.callTool({
            name: 'execute_sql',
            arguments: {
                query: `
          INSERT INTO test_users (name, email) VALUES 
          ('张三', 'zhangsan@example.com'),
          ('李四', 'lisi@example.com');
        `
            }
        });
        console.log('插入数据结果:', insertResponse);
        // 查询数据
        console.log('\n查询数据...');
        const selectResponse = await client.callTool({
            name: 'execute_sql',
            arguments: {
                query: 'SELECT * FROM test_users;'
            }
        });
        console.log('查询结果:', selectResponse);
        // 关闭连接
        await client.close();
        console.log('\n测试完成，连接已关闭');
    }
    catch (error) {
        console.error('错误:', error);
    }
}
// 运行测试
main();
