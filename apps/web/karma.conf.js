// Firefox en vez de Chrome, en todo el proyecto: es el navegador que se usa acá
// para todo (capturas, pruebas manuales), así que los tests unitarios no
// deberían depender de un binario distinto que nadie usa a propósito.
process.env.CHROME_BIN = undefined;

module.exports = function (config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-firefox-launcher'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage'),
      require('@angular-devkit/build-angular/plugins/karma'),
    ],
    client: {
      jasmine: {},
      clearContext: false,
    },
    jasmineHtmlReporter: {
      suppressAll: true,
    },
    coverageReporter: {
      dir: require('path').join(__dirname, './coverage/web'),
      subdir: '.',
      reporters: [{ type: 'html' }, { type: 'text-summary' }],
    },
    reporters: ['progress', 'kjhtml'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    autoWatch: true,
    // Único navegador soportado en este proyecto. `FirefoxHeadless` la trae
    // `karma-firefox-launcher` de fábrica, sin necesidad de un launcher custom.
    browsers: ['FirefoxHeadless'],
    singleRun: false,
    restartOnFileChange: true,
  });
};
