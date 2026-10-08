# Расширения Hermes Launcher

## Провайдеры

Пользовательские провайдеры помещаются в `%APPDATA%/hermes-launcher/plugins/providers` как `.js`-файлы. Идентификатор должен начинаться с `plugin-`.

```js
module.exports = {
  id: 'plugin-example',
  name: 'Example Provider',
  async listModels(config) {
    return ['example-model'];
  }
};
```

Плагин не получает прямого доступа к renderer и должен возвращать только массив строк с именами моделей.

## Подписанный CI-релиз

В GitHub Actions добавляются secrets `WINDOWS_CERTIFICATE_BASE64` и `WINDOWS_CERTIFICATE_PASSWORD`. Публикация выполняется созданием Git-тега вида `v1.0.2`; workflow `release.yml` запускает тесты, сборку Electron и публикацию `.exe` в GitHub Release.
