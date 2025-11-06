#!/usr/bin/env node

/**
 * Скрипт для проверки всех зависимостей проекта
 * Проверяет импорты, доступность модулей и базовую функциональность
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
const errors = [];
const warnings = [];
const successes = [];

async function checkDependencies() {
  console.log('🔍 Проверка зависимостей проекта...\n');

  // Проверка серверных зависимостей
  console.log('📦 Серверные зависимости:');
  const serverDeps = [
    'express',
    'cors',
    'dotenv',
    'body-parser',
    'telegram',
    'uuid'
  ];

  for (const dep of serverDeps) {
    try {
      const module = await import(dep);
      if (module.default || module[dep] || Object.keys(module).length > 0) {
        successes.push(`✓ ${dep} - установлен и доступен`);
        console.log(`  ✓ ${dep}`);
      } else {
        warnings.push(`⚠ ${dep} - установлен, но экспорт не найден`);
        console.log(`  ⚠ ${dep} (экспорт не найден)`);
      }
    } catch (error) {
      errors.push(`✗ ${dep} - ошибка импорта: ${error.message}`);
      console.log(`  ✗ ${dep} - ${error.message}`);
    }
  }

  // Проверка клиентских зависимостей (только основные)
  console.log('\n📦 Клиентские зависимости (основные):');
  const clientDeps = [
    'react',
    'react-dom',
    'react-router-dom',
    '@tanstack/react-query'
  ];

  for (const dep of clientDeps) {
    try {
      const module = await import(dep);
      if (module.default || Object.keys(module).length > 0) {
        successes.push(`✓ ${dep} - установлен и доступен`);
        console.log(`  ✓ ${dep}`);
      } else {
        warnings.push(`⚠ ${dep} - установлен, но экспорт не найден`);
        console.log(`  ⚠ ${dep} (экспорт не найден)`);
      }
    } catch (error) {
      if (error.code === 'ERR_MODULE_NOT_FOUND') {
        warnings.push(`⚠ ${dep} - требуется установка (npm install)`);
        console.log(`  ⚠ ${dep} - требуется установка`);
      } else {
        errors.push(`✗ ${dep} - ошибка: ${error.message}`);
        console.log(`  ✗ ${dep} - ${error.message}`);
      }
    }
  }

  // Проверка файлов сервера
  console.log('\n📁 Проверка файлов сервера:');
  const serverFiles = [
    'server/index.js',
    'server/routes/tasks.js',
    'server/routes/telegram.js',
    'server/routes/settings.js',
    'server/routes/user.js',
    'server/lib/taskManager.js',
    'server/lib/storage.js',
    'server/lib/logger.js',
    'server/lib/users.js',
    'server/services/telegramClient.js'
  ];

  for (const file of serverFiles) {
    try {
      const filePath = join(__dirname, file);
      readFileSync(filePath, 'utf-8');
      successes.push(`✓ ${file} - существует`);
      console.log(`  ✓ ${file}`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        errors.push(`✗ ${file} - файл не найден`);
        console.log(`  ✗ ${file} - не найден`);
      } else {
        errors.push(`✗ ${file} - ошибка чтения: ${error.message}`);
        console.log(`  ✗ ${file} - ${error.message}`);
      }
    }
  }

  // Проверка конфигурационных файлов
  console.log('\n⚙️  Конфигурационные файлы:');
  const configFiles = [
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
    'tailwind.config.ts',
    'package.json'
  ];

  for (const file of configFiles) {
    try {
      const filePath = join(__dirname, file);
      readFileSync(filePath, 'utf-8');
      successes.push(`✓ ${file} - существует`);
      console.log(`  ✓ ${file}`);
    } catch (error) {
      errors.push(`✗ ${file} - файл не найден`);
      console.log(`  ✗ ${file} - не найден`);
    }
  }

  // Итоги
  console.log('\n' + '='.repeat(50));
  console.log('📊 ИТОГИ ПРОВЕРКИ:');
  console.log(`  ✅ Успешно: ${successes.length}`);
  console.log(`  ⚠️  Предупреждений: ${warnings.length}`);
  console.log(`  ❌ Ошибок: ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n❌ ОШИБКИ:');
    errors.forEach(error => console.log(`  ${error}`));
  }

  if (warnings.length > 0) {
    console.log('\n⚠️  ПРЕДУПРЕЖДЕНИЯ:');
    warnings.forEach(warning => console.log(`  ${warning}`));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n🎉 Все проверки пройдены успешно!');
    process.exit(0);
  } else if (errors.length === 0) {
    console.log('\n✅ Критических ошибок нет, но есть предупреждения.');
    process.exit(0);
  } else {
    console.log('\n❌ Обнаружены критические ошибки. Исправьте их перед запуском проекта.');
    process.exit(1);
  }
}

// Запуск проверки
checkDependencies().catch(error => {
  console.error('❌ Критическая ошибка при выполнении проверки:', error);
  process.exit(1);
});

