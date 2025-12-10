export const createChunks = (file: File | Blob, chunkSize: number): Blob[] => {
    const chunkList: Blob[] = [];
    let cur = 0;
    while (cur < file.size) {
        chunkList.push(file.slice(cur, cur + chunkSize));
        cur += chunkSize;
    }
    return chunkList;
};
