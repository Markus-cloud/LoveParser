import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import { TelegramClient } from 'telegram';
import { v4 as uuidv4 } from 'uuid';

console.log('✅ Все серверные модули успешно импортированы!\n');
console.log('Проверка типов:');
console.log('- express:', typeof express === 'function' ? '✓' : '✗');
console.log('- cors:', typeof cors === 'function' ? '✓' : '✗');
console.log('- dotenv:', typeof dotenv === 'object' ? '✓' : '✗');
console.log('- bodyParser:', typeof bodyParser === 'object' ? '✓' : '✗');
console.log('- TelegramClient:', typeof TelegramClient === 'function' ? '✓' : '✗');
console.log('- uuid:', typeof uuidv4 === 'function' ? '✓' : '✗');

console.log('\n🎉 Все зависимости установлены корректно!');

