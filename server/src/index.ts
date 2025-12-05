import Koa from 'koa';
import Router from '@koa/router';
import { koaBody } from 'koa-body';
import cors from '@koa/cors';
import path from 'path';
import fs from 'fs-extra';
// 使用相对路径代替 alias，避免 TS 编译路径解析问题
import { ApiResponse, CheckFileResult } from './types/index';
import { ensureUploadDir, mergeChunks, TEMP_DIR, UPLOAD_DIR, extractExt } from './utils/file';

// 初始化上传目录
ensureUploadDir();

const app = new Koa();
const router = new Router();

// Middleware
app.use(cors());
app.use(koaBody({
    multipart: true,
    formidable: {
        maxFileSize: 10 * 1024 * 1024 * 1024, // 10GB (支持超大文件)
        keepExtensions: true,
    }
}));

// Validators
const isValidHash = (hash: string) => /^[a-fA-F0-9]{32}$/.test(hash);
const isValidFilename = (filename: string) => !filename.includes('/') && !filename.includes('\\') && filename !== '..';

// Helper: 获取资源访问 URL
const getResourceUrl = (ctx: Koa.Context, filename: string) => {
    return `${ctx.origin}/uploads/${filename}`;
};

// Routes

// 1. 验证接口 (Verify)
router.post('/verify', async (ctx) => {
    const body = ctx.request.body as any;
    const { fileHash, filename } = body;

    if (!fileHash || !filename) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'Missing parameters' };
        return;
    }

    // 安全校验: 防止路径遍历
    if (!isValidHash(fileHash) || !isValidFilename(filename)) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'Invalid fileHash or filename' };
        return;
    }

    const ext = extractExt(filename);
    const filePath = path.resolve(UPLOAD_DIR, `${fileHash}${ext}`);

    // 1. 检查完整文件是否存在 (秒传)
    if (await fs.pathExists(filePath)) {
        const response: ApiResponse<CheckFileResult> = {
            code: 200,
            message: 'File already exists (Seconds Upload)',
            data: {
                shouldUpload: false,
                uploadedChunks: []
            }
        };
        ctx.body = response;
        return;
    }

    // 2. 检查是否存在临时切片 (断点续传)
    const chunkDir = path.resolve(TEMP_DIR, fileHash);
    let uploadedChunks: string[] = [];
    if (await fs.pathExists(chunkDir)) {
        uploadedChunks = await fs.readdir(chunkDir);
    }

    const response: ApiResponse<CheckFileResult> = {
        code: 200,
        message: 'Verification success',
        data: {
            shouldUpload: true,
            uploadedChunks: uploadedChunks
        }
    };
    ctx.body = response;
});

// 2. 上传切片接口 (Upload)
router.post('/upload', async (ctx) => {
    const file = ctx.request.files?.chunk;
    const body = ctx.request.body as any;
    const { hash, fileHash } = body;
    // hash 格式: fileHash-index (e.g., "d41d8cd98f00b204e9800998ecf8427e-0")

    if (!file || !hash || !fileHash) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'Missing parameters' };
        return;
    }

    if (!isValidHash(fileHash)) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'Invalid fileHash' };
        return;
    }

    // @ts-ignore
    const chunkPath = file.filepath || file.path; // koa-body v4 vs v6 difference handling
    const chunkDir = path.resolve(TEMP_DIR, fileHash);

    // 确保切片目录存在
    await fs.ensureDir(chunkDir);

    // 移动切片到目标目录
    // 目标路径: uploads/temp/:fileHash/:hash
    // 这里 hash 应该是 fileHash-index 格式，我们可以简单校验一下是否包含 fileHash
    if (!hash.startsWith(fileHash)) {
         ctx.status = 400;
         ctx.body = { code: 400, message: 'Invalid chunk hash' };
         return;
    }

    const targetPath = path.resolve(chunkDir, hash);

    if (await fs.pathExists(targetPath)) {
         // 切片已存在，无需移动，直接返回成功
         ctx.body = { code: 200, message: 'Chunk already exists' };
         return;
    }

    await fs.move(chunkPath, targetPath);

    ctx.body = {
        code: 200,
        message: 'Chunk uploaded success',
        data: hash
    };
});

// 3. 合并接口 (Merge)
router.post('/merge', async (ctx) => {
    const body = ctx.request.body as any;
    const { fileHash, filename, size } = body;

    if (!fileHash || !filename) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'Missing parameters' };
        return;
    }

    // 安全校验
    if (!isValidHash(fileHash) || !isValidFilename(filename)) {
        ctx.status = 400;
        ctx.body = { code: 400, message: 'Invalid fileHash or filename' };
        return;
    }

    const ext = extractExt(filename);
    const finalFilename = `${fileHash}${ext}`; // 使用 Hash 命名文件
    const finalFilePath = path.resolve(UPLOAD_DIR, finalFilename);

    // 优化: 如果文件已存在，直接返回成功，避免重复合并
    if (await fs.pathExists(finalFilePath)) {
        ctx.body = {
            code: 200,
            message: 'File already merged',
            data: {
                url: getResourceUrl(ctx, finalFilename)
            }
        };
        return;
    }

    try {
        await mergeChunks(fileHash, finalFilename, size);

        const response: ApiResponse<{ url: string }> = {
            code: 200,
            message: 'File merged success',
            data: {
                url: getResourceUrl(ctx, finalFilename)
            }
        };
        ctx.body = response;
    } catch (error: any) {
        console.error('Merge failed:', error);
        ctx.status = 500;
        ctx.body = { code: 500, message: `Merge failed: ${error.message}` };
    }
});

// 静态文件服务 (用于访问上传后的文件)
import serve from 'koa-static';
app.use(serve(path.resolve(__dirname, '../../'))); // Serve root to access uploads

// Register routes
app.use(router.routes()).use(router.allowedMethods());

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
