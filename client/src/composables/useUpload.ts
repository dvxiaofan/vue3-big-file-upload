import { ref, computed } from 'vue';
import request from '../utils/request';
import { calculateHash } from '../utils/hash';
import { createChunks } from '../utils/chunk';

// 常量定义
const CHUNK_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_CONCURRENT_REQUESTS = 4; // 最大并发数

// 类型定义
export interface UploadStatus {
    step: 'idle' | 'hashing' | 'uploading' | 'merging' | 'completed' | 'error' | 'paused';
    progress: number; // 总进度
    hashProgress: number; // Hash 计算进度
    message?: string;
    speed?: string; // 上传速度 (e.g., "2.5 MB/s")
    remainingTime?: string; // 预计剩余时间 (e.g., "12s")
}

interface ChunkInfo {
    chunk: Blob;
    hash: string; // 切片 Hash (fileHash + index)
    index: number;
    size: number;
    status: 'pending' | 'uploading' | 'completed' | 'error';
    progress: number;
    retryCount: number;
}

export function useUpload() {
    const status = ref<UploadStatus>({
        step: 'idle',
        progress: 0,
        hashProgress: 0,
        message: ''
    });

    const file = ref<File | null>(null);
    const fileHash = ref<string>('');
    const chunks = ref<ChunkInfo[]>([]);
    const uploadedChunks = ref<string[]>([]); // 已上传的切片 Hash 列表
    const downloadUrl = ref<string>('');

    // 速度计算相关
    let startTime = 0;
    let startLoaded = 0; // 开始计算时的已上传量
    let lastTime = 0; // 上次计算时间


    // 控制暂停
    const isPaused = ref(false);
    // 存储当前正在进行的请求的 AbortController (如果用 axios cancel token 也可以)
    // 这里简单起见，我们通过 isPaused 标志位来控制调度器是否继续发送新请求
    // 真正的“取消正在进行的请求”比较复杂，这里实现“暂停调度”即可达到效果

    // 选择文件
    const handleFileChange = (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
            file.value = target.files[0]!;
            reset();
        }
    };

    const reset = () => {
        status.value = { step: 'idle', progress: 0, hashProgress: 0, message: '', speed: '', remainingTime: '' };
        fileHash.value = '';
        chunks.value = [];
        uploadedChunks.value = [];
        downloadUrl.value = '';
        isPaused.value = false;
        startTime = 0;
        startLoaded = 0;
        lastTime = 0;
    };

    // 2. 核心上传流程
    const upload = async () => {
        if (!file.value) return;

        try {
            isPaused.value = false;

            // 如果已经在上传中（例如暂停后恢复），则跳过 Hash 计算
            if (status.value.step !== 'uploading' && status.value.step !== 'paused') {
                status.value.step = 'hashing';
                // 计算 Hash (抽样 Hash 不需要 CHUNK_SIZE)
                fileHash.value = await calculateHash(file.value, (p) => {
                    status.value.hashProgress = p;
                });

                // 校验文件 (秒传/断点续传)
                const verifyRes = await request.post('/verify', {
                    filename: file.value.name,
                    fileHash: fileHash.value
                });

                const { shouldUpload, uploadedChunks: uploaded } = verifyRes.data;

                if (!shouldUpload) {
                    status.value.step = 'completed';
                    status.value.progress = 100;
                    status.value.message = '秒传成功';
                    // 尝试获取 URL (后端 verify 接口在秒传时没有返回 URL，可能需要 merge 接口或者 verify 增强)
                    // 暂时我们假设秒传也调用 merge 或者直接构造 URL
                    await mergeRequest();
                    return;
                }

                uploadedChunks.value = uploaded || [];

                // 生成切片数据结构
                const blobChunks = createChunks(file.value, CHUNK_SIZE);
                chunks.value = blobChunks.map((chunk, index) => ({
                    chunk,
                    hash: `${fileHash.value}-${index}`,
                    index,
                    size: chunk.size,
                    status: uploadedChunks.value.includes(`${fileHash.value}-${index}`) ? 'completed' : 'pending',
                    progress: uploadedChunks.value.includes(`${fileHash.value}-${index}`) ? 100 : 0,
                    retryCount: 0
                }));
            }

            // 开始并发上传
            status.value.step = 'uploading';

            // 初始化速度计算
            startTime = Date.now();
            lastTime = startTime;
            // 计算初始已上传量 (断点续传情况)
            startLoaded = chunks.value
                .filter(c => c.status === 'completed')
                .reduce((acc, cur) => acc + cur.size, 0);

            await uploadChunks();

        } catch (error: any) {
            console.error(error);
            status.value.step = 'error';
            status.value.message = error.message || '上传失败';
        }
    };

    // 3. 并发上传调度器
    const uploadChunks = async () => {
        const pendingChunks = chunks.value.filter(c => c.status === 'pending');

        if (pendingChunks.length === 0) {
            // 所有切片都已标记为 completed (可能是断点续传刚开始就发现全传完了)
            if (chunks.value.every(c => c.status === 'completed')) {
                await mergeRequest();
            }
            return;
        }

        // 简单的并发控制
        // 维护一个请求池
        const pool: Promise<any>[] = [];

        // 遍历所有需要上传的切片
        // 注意：这里需要实现一个动态填充的池子，而不是一次性把所有 promise 创建出来
        // 我们使用递归或者 while 循环配合 Promise.race

        // 为了支持暂停，我们不能使用简单的 Promise.all
        // 我们实现一个递归调度器

        let index = 0; // 当前处理到的 pendingChunks 索引

        // 调度函数
        const run = async () => {
             if (isPaused.value) return; // 暂停

             if (status.value.step === 'error') return;

             // 检查是否所有切片完成
             if (chunks.value.every(c => c.status === 'completed')) {
                 await mergeRequest();
                 return;
             }

             // 找到下一个待上传的切片
             // 注意：pendingChunks 是快照，状态会变，所以最好直接遍历 chunks
             const nextChunk = chunks.value.find(c => c.status === 'pending');
             if (!nextChunk) {
                 // 没有 pending 的了，可能正在上传中，等待即可
                 return;
             }

             // 执行上传
             const task = uploadChunk(nextChunk);

             // 将 task 加入池子
             pool.push(task);

             // 任务完成后从池子移除
             task.then(() => {
                 pool.splice(pool.indexOf(task), 1);
                 // 尝试继续添加任务
                 run();
             }).catch(() => {
                 // 失败处理在 uploadChunk 内部，这里主要是移除池子
                 pool.splice(pool.indexOf(task), 1);
                 run();
             });

             // 如果池子没满，继续添加
             if (pool.length < MAX_CONCURRENT_REQUESTS) {
                 run();
             }
        };

        // 启动调度
        // 启动 min(pending, max) 个任务
        const startCount = Math.min(pendingChunks.length, MAX_CONCURRENT_REQUESTS);
        for(let i=0; i<startCount; i++) {
             run();
        }
    };

    // 单个切片上传
    const uploadChunk = async (chunkInfo: ChunkInfo) => {
        if (isPaused.value) return;

        chunkInfo.status = 'uploading';

        const formData = new FormData();
        formData.append('chunk', chunkInfo.chunk);
        formData.append('hash', chunkInfo.hash);
        formData.append('fileHash', fileHash.value);

        try {
            await request.post('/upload', formData, {
                onUploadProgress: (e) => {
                    if (e.total) {
                        chunkInfo.progress = Math.round((e.loaded / e.total) * 100);
                        updateTotalProgress();
                    }
                }
            });
            chunkInfo.status = 'completed';
            chunkInfo.progress = 100;
            updateTotalProgress();
        } catch (error) {
            console.error(`Chunk ${chunkInfo.index} upload failed`, error);
            if (chunkInfo.retryCount < 3) {
                chunkInfo.retryCount++;
                chunkInfo.status = 'pending'; // 失败重置为 pending，等待重试
            } else {
                chunkInfo.status = 'error';
                status.value.step = 'error';
                status.value.message = '上传失败，重试次数超限';
            }
        }
    };

    // 更新总进度
    const updateTotalProgress = () => {
        if (!file.value || chunks.value.length === 0) return;

        const loaded = chunks.value
            .map(item => item.size * item.progress / 100)
            .reduce((acc, cur) => acc + cur, 0);

        const total = file.value.size;
        status.value.progress = Math.round((loaded / total) * 100);

        // 计算速度和剩余时间 (每 500ms 更新一次，避免闪烁)
        const now = Date.now();
        if (now - lastTime >= 500 && status.value.step === 'uploading') {
            const timeElapsed = (now - startTime) / 1000; // 秒
            const loadedDiff = loaded - startLoaded;

            if (timeElapsed > 0 && loadedDiff > 0) {
                const speedBytes = loadedDiff / timeElapsed; // B/s
                const remainingBytes = total - loaded;
                const remainingSeconds = remainingBytes / speedBytes;

                status.value.speed = formatSpeed(speedBytes);
                status.value.remainingTime = formatTime(remainingSeconds);
            }
            lastTime = now;
        }
    };

    const formatSpeed = (bytesPerSecond: number): string => {
        if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(0) + ' B/s';
        if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s';
        return (bytesPerSecond / 1024 / 1024).toFixed(1) + ' MB/s';
    };

    const formatTime = (seconds: number): string => {
        if (!isFinite(seconds) || seconds < 0) return '-';
        if (seconds < 60) return Math.ceil(seconds) + 's';
        const mins = Math.floor(seconds / 60);
        const secs = Math.ceil(seconds % 60);
        return `${mins}m ${secs}s`;
    };

    // 4. 合并请求
    const mergeRequest = async () => {
        if (status.value.step === 'merging' || status.value.step === 'completed') return;

        status.value.step = 'merging';
        try {
            const res = await request.post('/merge', {
                fileHash: fileHash.value,
                filename: file.value?.name,
                size: CHUNK_SIZE
            });

            status.value.step = 'completed';
            status.value.message = '上传完成';
            downloadUrl.value = res.data.url;
        } catch (error: any) {
            console.error('Merge failed', error);
            status.value.step = 'error';
            status.value.message = '合并失败: ' + error.message;
        }
    };

    const pause = () => {
        isPaused.value = true;
        status.value.step = 'paused';
        status.value.message = '已暂停';
    };

    const resume = () => {
        if (status.value.step !== 'paused') return;
        isPaused.value = false; // 必须重置暂停状态，否则调度器无法启动新任务
        status.value.step = 'uploading';
        status.value.message = '继续上传...';
        uploadChunks(); // 重新启动调度器
    };

    return {
        file,
        status,
        downloadUrl,
        handleFileChange,
        upload,
        pause,
        resume
    };
}
