import { createApp } from 'vue';
import { Alert, Button, Typography } from 'ant-design-vue';
import 'ant-design-vue/dist/reset.css';
import App from './App.vue';

createApp(App).use(Alert).use(Button).use(Typography).mount('#app');
