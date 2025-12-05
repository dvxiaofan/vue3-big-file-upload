import fs from 'fs-extra';
import path from 'path';

export const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
export const TEMP_DIR = path.resolve(UPLOAD_DIR, 'temp');

// 确保目录存在
export const ensureUploadDir = async () => {
    await fs.ensureDir(UPLOAD_DIR);
    await fs.ensureDir(TEMP_DIR);
};

// 提取文件后缀名
export const extractExt = (filename: string) => {
    // 使用 path.extname 获取后缀，更安全可靠
    // 如果没有后缀，返回空字符串
    return path.extname(filename);
};

// 管道流合并文件
const pipeStream = (path: string, writeStream: fs.WriteStream): Promise<void> => {
    return new Promise((resolve, reject) => {
        const readStream = fs.createReadStream(path);

        readStream.on('end', () => {
            fs.unlinkSync(path); // 合并完删除切片
            resolve();
        });

        // 增加错误处理，防止 Promise 挂起
        readStream.on('error', (err) => {
            console.error(`Read stream error for ${path}:`, err);
            readStream.destroy();
            reject(err);
        });

        readStream.pipe(writeStream, { end: false });
    });
};

// 合并切片
export const mergeChunks = async (fileHash: string, filename: string, size?: number) => {
    const chunkDir = path.resolve(TEMP_DIR, fileHash);
    const filePath = path.resolve(UPLOAD_DIR, filename);

    // 读取所有切片路径
    if (!await fs.pathExists(chunkDir)) {
        throw new Error('Chunks not found');
    }

    const chunks = await fs.readdir(chunkDir);

    // 过滤无效文件并排序
    // 假设切片命名格式为: fileHash-index
    // 必须严格过滤，防止 .DS_Store 或其他杂文件导致合并错误
    const validChunks = chunks.filter(chunkName => {
        // 简单校验：必须包含 fileHash 且以数字结尾
        // 更严格的校验可以在 upload 阶段保证，这里做防御性编程
        if (!chunkName.startsWith(fileHash)) return false;
        const indexStr = chunkName.split('-').pop();
        return indexStr && !isNaN(parseInt(indexStr));
    });

    if (validChunks.length === 0) {
         throw new Error('No valid chunks found');
    }

    validChunks.sort((a, b) => {
        const indexA = parseInt(a.split('-').pop() || '0');
        const indexB = parseInt(b.split('-').pop() || '0');
        return indexA - indexB;
    });

    const pipeStreamList = validChunks.map((chunkPath) => {
        return path.resolve(chunkDir, chunkPath);
    });

    // 创建写入流
    const writeStream = fs.createWriteStream(filePath);

    // 监听写入流错误
    writeStream.on('error', (err) => {
        console.error('Write stream error:', err);
        writeStream.destroy();
    });

    try {
        for (const chunkPath of pipeStreamList) {
            await pipeStream(chunkPath, writeStream);
        }
        writeStream.end(); // 写入完成，关闭流
    } catch (error) {
        writeStream.destroy(); // 发生错误销毁流
        throw error;
    }

    // 删除切片目录
    await fs.remove(chunkDir);

    return filePath;
};
