<script setup lang="ts">
import { useUpload } from './composables/useUpload';

const {
  file,
  status: uploadStatus,
  downloadUrl,
  handleFileChange,
  upload,
  pause,
  resume
} = useUpload();

const stepLabels: Record<string, string> = {
  idle: '待上传',
  hashing: '计算哈希中',
  uploading: '上传中',
  merging: '合并中',
  completed: '上传完成',
  error: '上传失败',
  paused: '已暂停'
};

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};
</script>

<template>
  <div class="container">
    <div class="card">
      <h2 class="title">🚀 大文件高速上传</h2>

      <div class="upload-zone" :class="{ 'has-file': file }">
        <input
          type="file"
          id="fileInput"
          @change="handleFileChange"
          :disabled="uploadStatus.step === 'uploading' || uploadStatus.step === 'hashing'"
        />
        <label for="fileInput" class="upload-label">
          <span v-if="!file" class="icon">📁</span>
          <span v-if="!file" class="text">点击或拖拽文件到此处</span>

          <div v-else class="file-preview">
            <span class="icon-file">📄</span>
            <div class="file-details">
              <span class="name">{{ file.name }}</span>
              <span class="size">{{ formatSize(file.size) }}</span>
            </div>
          </div>
        </label>
      </div>

      <div class="actions" v-if="file">
        <button
          v-if="uploadStatus.step === 'idle' || uploadStatus.step === 'error'"
          @click="upload"
          class="btn primary"
        >
          开始上传
        </button>

        <button
          v-if="uploadStatus.step === 'uploading'"
          @click="pause"
          class="btn warning"
        >
          ⏸ 暂停
        </button>

        <button
          v-if="uploadStatus.step === 'paused'"
          @click="resume"
          class="btn primary"
        >
          ▶ 继续
        </button>
      </div>

      <div class="status-panel" v-if="uploadStatus.step !== 'idle'">
        <div class="status-header">
          <span class="status-badge" :class="uploadStatus.step">
            {{ uploadStatus.message || stepLabels[uploadStatus.step] || uploadStatus.step }}
          </span>
          <span class="percentage" v-if="uploadStatus.step === 'hashing'">{{ uploadStatus.hashProgress }}%</span>
          <span class="percentage" v-if="['uploading', 'paused', 'merging'].includes(uploadStatus.step)">{{ uploadStatus.progress }}%</span>
        </div>

        <div class="progress-container">
          <!-- Hash 进度条 -->
          <div v-if="uploadStatus.step === 'hashing'" class="progress-bar hashing">
            <div class="progress-fill" :style="{ width: uploadStatus.hashProgress + '%' }"></div>
          </div>

          <!-- 上传进度条 -->
          <div v-else class="progress-bar uploading">
            <div class="progress-fill" :class="{ 'merging-fill': uploadStatus.step === 'merging' }" :style="{ width: uploadStatus.progress + '%' }"></div>
          </div>
        </div>

        <div v-if="uploadStatus.step === 'uploading' || uploadStatus.step === 'paused' || uploadStatus.step === 'merging'" class="speed-info">
            <span v-if="uploadStatus.step !== 'merging'">🚀 {{ uploadStatus.speed || '-' }}</span>
            <span v-if="uploadStatus.step !== 'merging'">⏱️ 预计剩余: {{ uploadStatus.remainingTime || '-' }}</span>
            <span v-else class="merging-text">🔄 服务器正在合并切片，请耐心等待...</span>
        </div>

        <div v-if="uploadStatus.step === 'completed' && downloadUrl" class="result-box">
          <p>🎉 上传成功！</p>
        </div>

        <div v-if="uploadStatus.step === 'error'" class="error-box">
          ⚠️ {{ uploadStatus.message }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 全局容器 */
.container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 1rem;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #333;
}

/* 卡片样式 */
.card {
  background: white;
  padding: 2.5rem;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
  width: 100%;
  max-width: 800px;
  text-align: center;
  transition: transform 0.3s ease;
}

.title {
  margin-top: 0;
  margin-bottom: 2rem;
  color: #2c3e50;
  font-size: 1.8rem;
}

/* 上传区域 */
.upload-zone {
  position: relative;
  margin-bottom: 2rem;
}

.upload-zone input[type="file"] {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  z-index: 2;
}

.upload-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  border: 2px dashed #dcdfe6;
  border-radius: 12px;
  background-color: #fafafa;
  transition: all 0.3s ease;
  min-height: 160px;
}

.upload-zone:hover .upload-label {
  border-color: #409eff;
  background-color: #ecf5ff;
}

.upload-zone.has-file .upload-label {
  border-style: solid;
  border-color: #67c23a;
  background-color: #f0f9eb;
  padding: 1.5rem;
}

.icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.text {
  color: #909399;
  font-size: 1rem;
}

/* 文件预览 */
.file-preview {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.icon-file {
  font-size: 2.5rem;
}

.file-details {
  text-align: left;
  display: flex;
  flex-direction: column;
}

.file-details .name {
  font-weight: 600;
  color: #333;
  word-break: break-all;
}

.file-details .size {
  font-size: 0.85rem;
  color: #666;
  margin-top: 4px;
}

/* 按钮组 */
.actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
  margin-bottom: 2rem;
}

.btn {
  padding: 0.8rem 2rem;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 6px rgba(0,0,0,0.1);
}

.btn:active {
  transform: translateY(1px);
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.btn.primary {
  background: linear-gradient(90deg, #409eff 0%, #2980b9 100%);
  color: white;
}

.btn.warning {
  background: linear-gradient(90deg, #e6a23c 0%, #d35400 100%);
  color: white;
}

.btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* 状态面板 */
.status-panel {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 1.5rem;
  text-align: left;
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-badge.hashing { background: #fdf6ec; color: #e6a23c; }
.status-badge.uploading { background: #ecf5ff; color: #409eff; }
.status-badge.merging { background: #e8f3ff; color: #409eff; animation: pulse 1.5s infinite; }
.status-badge.paused { background: #f4f4f5; color: #909399; }
.status-badge.completed { background: #f0f9eb; color: #67c23a; }
.status-badge.error { background: #fef0f0; color: #f56c6c; }

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}

.percentage {
  font-weight: bold;
  color: #606266;
}

/* 进度条 */
.progress-container {
  height: 8px;
  background-color: #ebeef5;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 1rem;
}

.progress-bar {
  height: 100%;
  width: 100%;
}

.progress-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.4s ease;
}

.progress-bar.hashing .progress-fill {
  background-color: #e6a23c;
  background-image: linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent);
  background-size: 1rem 1rem;
}

.progress-bar.uploading .progress-fill {
  background-color: #409eff;
}

.progress-fill.merging-fill {
  background-image: linear-gradient(45deg,rgba(255,255,255,.15) 25%,transparent 25%,transparent 50%,rgba(255,255,255,.15) 50%,rgba(255,255,255,.15) 75%,transparent 75%,transparent);
  background-size: 1rem 1rem;
  animation: progress-stripe 1s linear infinite;
}

@keyframes progress-stripe {
  from { background-position: 1rem 0; }
  to { background-position: 0 0; }
}

/* 结果与错误 */
.result-box {
  text-align: center;
  margin-top: 1rem;
}

.download-link {
  display: inline-block;
  margin-top: 0.5rem;
  color: #409eff;
  text-decoration: none;
  font-weight: 600;
  border-bottom: 1px dashed #409eff;
}

.error-box {
  color: #f56c6c;
  font-size: 0.9rem;
  margin-top: 0.5rem;
}

.speed-info {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  color: #909399;
  margin-top: 0.5rem;
  padding: 0 4px;
}

.merging-text {
  width: 100%;
  text-align: center;
  color: #409eff;
  font-weight: 500;
  animation: pulse 1.5s infinite;
}
</style>
