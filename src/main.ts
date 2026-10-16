import './assets/main.css';

import { createApp } from 'vue';
import App from './App.vue';
import { Button, ConfigProvider, Modal, Switch, Tooltip } from 'ant-design-vue';
import { createI18n } from 'vue-i18n';
import en from './lang/en.json';
import zh from './lang/zh.json';

const i18n = createI18n({
  locale: 'zh',
  fallbackLocale: 'en',
  messages: {
    en: en,
    zh: zh
  }
});

createApp(App)
  .use(i18n)
  .use(Button)
  .use(ConfigProvider)
  .use(Modal)
  .use(Switch)
  .use(Tooltip)
  .mount('#app');
