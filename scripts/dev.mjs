process.env.NODE_ENV = 'development';
process.argv = [process.execPath, 'tsx', 'server/_core/index.ts', ...process.argv.slice(2)];

await import('tsx/cli');
