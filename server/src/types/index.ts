export interface ApiResponse<T = any> {
    code: number;
    message: string;
    data?: T;
}

export interface CheckFileResult {
    shouldUpload: boolean;
    uploadedChunks: string[];
}
