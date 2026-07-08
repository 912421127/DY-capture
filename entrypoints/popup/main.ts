import { createApp } from 'vue';
import { Alert, Button, Typography } from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import App from './App.vue';

// Popup 入口：创建 Vue 应用并挂载到 #app，按需注册用到的 Ant Design Vue 组件（Alert / Button / Typography）。
createApp(App).use(Alert).use(Button).use(Typography).mount('#app');
