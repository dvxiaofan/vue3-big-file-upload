import axios from 'axios';
import type { AxiosInstance, AxiosRequestConfig } from 'axios';

// 创建 axios 实例
const service: AxiosInstance = axios.create({
    baseURL: 'http://localhost:3000', // 后端地址
    timeout: 0, // 上传大文件不设超时限制
});

// 响应拦截器
service.interceptors.response.use(
    (response) => {
        const res = response.data;
        // 假设后端统一返回 { code: 200, message: 'xxx', data: ... }
        if (res.code !== 200) {
            console.error('API Error:', res.message);
            return Promise.reject(new Error(res.message || 'Error'));
        }
        return res;
    },
    (error) => {
        console.error('Network Error:', error);
        return Promise.reject(error);
    }
);

export default service;
