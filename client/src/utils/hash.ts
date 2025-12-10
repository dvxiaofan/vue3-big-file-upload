import SparkMD5 from 'spark-md5';

/**
 * 计算文件的抽样 Hash 值 (Sampling Hash)
 * 牺牲极小概率的碰撞风险，换取极快的计算速度
 * 
 * 策略：
 * 1. 头 2MB
 * 2. 尾 2MB
 * 3. 中间每隔 2MB 取 2KB
 * 
 * @param file 文件对象
 * @param onProgress 进度回调
 */
export const calculateHash = (
    file: File,
    onProgress?: (percentage: number) => void
): Promise<string> => {
    return new Promise((resolve, reject) => {
        const spark = new SparkMD5.ArrayBuffer();
        const reader = new FileReader();
        
        const size = file.size;
        const offset = 2 * 1024 * 1024; // 2MB
        
        // 抽样切片列表
        const chunks: Blob[] = [];
        
        // 1. 头 2MB
        chunks.push(file.slice(0, offset));
        
        // 2. 中间抽样
        let cur = offset;
        while (cur < size) {
            if (cur + offset >= size) break; // 接近尾部了，跳出
            chunks.push(file.slice(cur, cur + 2048)); // 取 2KB
            cur += offset; // 前进 2MB
        }
        
        // 3. 尾 2MB (如果文件小于 offset，可能会重叠，但不影响)
        chunks.push(file.slice(Math.max(0, size - offset), size));
        
        reader.onload = (e) => {
             if (e.target?.result) {
                 spark.append(e.target.result as ArrayBuffer);
                 resolve(spark.end());
                 onProgress?.(100);
             }
        };
        
        reader.onerror = () => reject(new Error('Read file failed'));

        // 将所有抽样 Blob 合并为一个新的 Blob 读取
        // 注意：如果抽样太多，直接 readAsArrayBuffer 可能会大，但通常几 GB 文件抽样出来也就几 MB
        const samplingBlob = new Blob(chunks);
        
        // 简单的进度模拟 (因为读取很快，通常不需要复杂进度，这里直接给结果)
        // 如果想做精细进度，需要分块 read，但对于几 MB 数据没必要
        onProgress?.(50); 
        
        reader.readAsArrayBuffer(samplingBlob);
    });
};
