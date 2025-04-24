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

  // Инициализация сканера
  function initScanner() {
    Quagga.init(
      {
        inputStream: {
          name: 'Live',
          type: 'LiveStream',
          target: scannerElement,
          constraints: {
            width: 500,
            height: 300,
            facingMode: 'environment', // Используем заднюю камеру
          },
        },
        decoder: {
          readers: ['ean_reader', 'ean_8_reader', 'code_128_reader', 'upc_reader', 'upc_e_reader'],
        },
        locate: true,
      },
      function (err) {
        if (err) {
          console.error('Ошибка инициализации Quagga:', err);
          showError(
            'Не удалось инициализировать сканер. Проверьте разрешение на использование камеры.',
          );
          return;
        }
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

    document.getElementById('product-name').textContent = product.name || 'Название не указано';

    if (product.image) {
      const imgElement = document.getElementById('product-image');
      imgElement.src = product.image;
      imgElement.style.display = 'block';
    }

    document.getElementById('product-calories').textContent = product.calories
      ? `${product.calories} ккал`
      : 'нет данных';
    document.getElementById('product-protein').textContent = product.protein
      ? `${product.protein} г`
      : 'нет данных';
    document.getElementById('product-fat').textContent = product.fat
      ? `${product.fat} г`
      : 'нет данных';
    document.getElementById('product-carbs').textContent = product.carbs
      ? `${product.carbs} г`
      : 'нет данных';

    productInfo.style.display = 'block';
  }

  // Получение данных о продукте по штрих-коду
  async function fetchProductData(barcode) {
    loadingElement.style.display = 'block';
    errorElement.style.display = 'none';
    productInfo.style.display = 'none';

    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
      );
      const data = await response.json();

      if (data.status === 1) {
        // Продукт найден
        const product = data.product;
        return {
          name: product.product_name || 'Неизвестный продукт',
          image: product.image_url,
          calories: product.nutriments?.energy_kcal_100g || product.nutriments?.energy_kcal,
          protein: product.nutriments?.proteins_100g || product.nutriments?.proteins,
          fat: product.nutriments?.fat_100g || product.nutriments?.fat,
          carbs: product.nutriments?.carbohydrates_100g || product.nutriments?.carbohydrates,
        };
      } else {
        return null;
      }
    } catch (error) {
      console.error('Ошибка при получении данных:', error);
      showError('Ошибка при загрузке данных о продукте');
      return null;
    } finally {
      loadingElement.style.display = 'none';
    }
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

  // Обработка обнаруженного штрих-кода
  Quagga.onDetected(async function (result) {
    const barcode = result.codeResult.code;
    console.log('Найден штрих-код:', barcode);

    stopScanner();
    manualBarcodeInput.value = barcode;

    const productData = await fetchProductData(barcode);
    displayProductInfo(productData);
  });
});
