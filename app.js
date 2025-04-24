document.addEventListener('DOMContentLoaded', function () {
  const startScanBtn = document.getElementById('start-scan');
  const stopScanBtn = document.getElementById('stop-scan');
  const manualSubmitBtn = document.getElementById('manual-submit');
  const manualBarcodeInput = document.getElementById('manual-barcode');
  const scannerElement = document.getElementById('barcode-scanner');
  const productInfo = document.getElementById('product-info');
  const loadingElement = document.getElementById('loading');
  const errorElement = document.getElementById('error');

  let isScanning = false;
  let lastScannedCode = '';
  let scanAttempts = 0;
  const maxScanAttempts = 5;

  // Проверка валидности штрих-кода
  function isValidBarcode(barcode) {
    if (!barcode) return false;

    // Проверка длины (EAN-13: 13 цифр, EAN-8: 8 цифр, UPC-A: 12 цифр)
    if (![8, 12, 13].includes(barcode.length)) return false;

    // Проверка, что это только цифры
    return /^\d+$/.test(barcode);
  }

  // Инициализация сканера с улучшенными настройками
  function initScanner() {
    Quagga.init(
      {
        inputStream: {
          name: 'Live',
          type: 'LiveStream',
          target: scannerElement,
          constraints: {
            width: 640,
            height: 480,
            facingMode: 'environment',
            aspectRatio: { ideal: 1.333333 },
          },
        },
        decoder: {
          readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'upc_reader', 'upc_e_reader'],
          multiple: false,
        },
        locator: {
          patchSize: 'medium',
          halfSample: true,
        },
        locate: true,
        numOfWorkers: navigator.hardwareConcurrency || 4,
        frequency: 10,
        debug: {
          drawBoundingBox: false,
          showFrequency: false,
          drawScanline: false,
          showPattern: false,
        },
      },
      function (err) {
        if (err) {
          console.error('Ошибка инициализации Quagga:', err);
          showError(
            'Не удалось инициализировать сканер. Проверьте разрешение на использование камеры.',
          );
          return;
        }

        // Сброс счетчика попыток
        scanAttempts = 0;

        Quagga.start();
        isScanning = true;
        startScanBtn.disabled = true;
        stopScanBtn.disabled = false;
      },
    );
  }

  // Остановка сканера
  function stopScanner() {
    if (isScanning) {
      Quagga.stop();
      isScanning = false;
      startScanBtn.disabled = false;
      stopScanBtn.disabled = true;
    }
  }

  // Показать информацию о продукте
  function displayProductInfo(product) {
    if (!product) {
      showError('Продукт не найден в базе данных');
      return;
    }

    // Очистка предыдущего изображения
    const imgElement = document.getElementById('product-image');
    imgElement.src = '';
    imgElement.style.display = 'none';

    // Установка новых данных
    document.getElementById('product-name').textContent = product.name || 'Название не указано';

    if (product.image) {
      imgElement.onload = function () {
        this.style.display = 'block';
      };
      imgElement.onerror = function () {
        this.style.display = 'none';
      };
      imgElement.src = product.image;
    }

    document.getElementById('product-calories').textContent = product.calories
      ? `${Math.round(product.calories)} ккал`
      : 'нет данных';
    document.getElementById('product-protein').textContent = product.protein
      ? `${Math.round(product.protein * 10) / 10} г`
      : 'нет данных';
    document.getElementById('product-fat').textContent = product.fat
      ? `${Math.round(product.fat * 10) / 10} г`
      : 'нет данных';
    document.getElementById('product-carbs').textContent = product.carbs
      ? `${Math.round(product.carbs * 10) / 10} г`
      : 'нет данных';

    productInfo.style.display = 'block';
  }

  // Получение данных о продукте по штрих-коду с проверкой нескольких источников
  async function fetchProductData(barcode) {
    if (!isValidBarcode(barcode)) {
      showError('Неверный формат штрих-кода');
      return null;
    }

    loadingElement.style.display = 'block';
    errorElement.style.display = 'none';
    productInfo.style.display = 'none';

    try {
      // Попробуем сначала Open Food Facts
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      );
      const data = await response.json();

      if (data.status === 1 && data.product) {
        const product = data.product;
        return formatProductData(product);
      }

      // Если не найдено в Open Food Facts, попробуем Nutritionix
      const nutritionixData = await tryNutritionix(barcode);
      if (nutritionixData) return nutritionixData;

      // Если ничего не найдено
      return null;
    } catch (error) {
      console.error('Ошибка при получении данных:', error);
      showError('Ошибка при загрузке данных о продукте');
      return null;
    } finally {
      loadingElement.style.display = 'none';
    }
  }

  // Попытка получить данные из Nutritionix
  async function tryNutritionix(barcode) {
    try {
      const response = await fetch(
        `https://api.nutritionix.com/v1_1/item?upc=${barcode}&appId=YOUR_APP_ID&appKey=YOUR_APP_KEY`,
      );
      const data = await response.json();

      if (data && data.item) {
        return {
          name: data.item.name || 'Неизвестный продукт',
          image: data.item.images?.[0] || null,
          calories: data.item.nf_calories,
          protein: data.item.nf_protein,
          fat: data.item.nf_total_fat,
          carbs: data.item.nf_total_carbohydrate,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  // Форматирование данных о продукте
  function formatProductData(product) {
    // Нормализация названия продукта
    let productName = 'Неизвестный продукт';
    if (product.product_name) {
      productName = product.product_name;
    } else if (product.product_name_en) {
      productName = product.product_name_en;
    } else if (product.abbreviated_product_name) {
      productName = product.abbreviated_product_name;
    }

    // Нормализация данных о питательности (на 100г или на порцию)
    const nutriments = product.nutriments || {};
    const calories = nutriments.energy_kcal_100g || nutriments.energy_kcal;
    const protein = nutriments.proteins_100g || nutriments.proteins;
    const fat = nutriments.fat_100g || nutriments.fat;
    const carbs = nutriments.carbohydrates_100g || nutriments.carbohydrates;

    return {
      name: productName,
      image: product.image_url || product.image_front_url || product.image_front_small_url || null,
      calories: calories,
      protein: protein,
      fat: fat,
      carbs: carbs,
    };
  }

  // Показать сообщение об ошибке
  function showError(message) {
    errorElement.textContent = message;
    errorElement.style.display = 'block';
    setTimeout(() => {
      errorElement.style.display = 'none';
    }, 5000);
  }

  // Обработчики событий
  startScanBtn.addEventListener('click', initScanner);

  stopScanBtn.addEventListener('click', stopScanner);

  manualSubmitBtn.addEventListener('click', async function () {
    const barcode = manualBarcodeInput.value.trim();
    if (barcode) {
      const productData = await fetchProductData(barcode);
      displayProductInfo(productData);
    } else {
      showError('Введите штрих-код');
    }
  });

  manualBarcodeInput.addEventListener('keypress', async function (e) {
    if (e.key === 'Enter') {
      const barcode = manualBarcodeInput.value.trim();
      if (barcode) {
        const productData = await fetchProductData(barcode);
        displayProductInfo(productData);
      }
    }
  });

  // Улучшенная обработка обнаруженного штрих-кода
  Quagga.onDetected(async function (result) {
    if (!result || !result.codeResult || !result.codeResult.code) return;

    const barcode = result.codeResult.code;
    console.log('Найден штрих-код:', barcode);

    // Проверка валидности штрих-кода
    if (!isValidBarcode(barcode)) {
      scanAttempts++;
      if (scanAttempts >= maxScanAttempts) {
        showError('Не удалось распознать штрих-код. Попробуйте ввести вручную.');
        stopScanner();
      }
      return;
    }

    // Проверка, что это не тот же самый код, что и в прошлый раз
    if (barcode === lastScannedCode) return;

    lastScannedCode = barcode;
    stopScanner();
    manualBarcodeInput.value = barcode;

    const productData = await fetchProductData(barcode);
    displayProductInfo(productData);
  });
});
