import 'dotenv/config';
import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const SCHEMA = 'school_aiternitas_ru';

const DEFAULT_PROGRAMS = [
  { title: 'Умняшки: логика и творчество', slug: 'умняшки-логика-творчество', description: 'Игровой курс для дошкольников: развитие логики, творческого мышления, основ счёта. Конструкторы и подготовка к робототехнике.', age_min: 5, age_max: 7, directions: ['логика', 'творчество', 'математика'], duration_weeks: 12, lessons_per_week: 1, format: 'игровой', school_type: 'tech' },
  { title: 'Собирай-ка: конструкторы', slug: 'собирай-ка-конструкторы', description: 'Работа с конструкторами для подготовки к робототехнике. Развитие мелкой моторики, пространственного мышления.', age_min: 5, age_max: 7, directions: ['творчество', 'робототехника'], duration_weeks: 8, lessons_per_week: 1, format: 'игровой', school_type: 'tech' },
  { title: 'Scratch: первые игры', slug: 'scratch-первые-игры', description: 'Визуальное программирование в Scratch. Создание анимаций, простых игр, проектная работа.', age_min: 8, age_max: 10, directions: ['программирование', 'творчество'], duration_weeks: 12, lessons_per_week: 1, format: 'модульный', school_type: 'tech' },
  { title: 'Математика и проекты', slug: 'математика-и-проекты', description: 'Математика через практические проекты. Решение задач, логика, работа в команде.', age_min: 8, age_max: 10, directions: ['математика', 'логика'], duration_weeks: 12, lessons_per_week: 1, format: 'модульный', school_type: 'tech' },
  { title: 'Робототехника: Lego', slug: 'робототехника-lego', description: 'Сборка и программирование роботов на Lego. Базовые механизмы, датчики, простые алгоритмы.', age_min: 8, age_max: 10, directions: ['робототехника', 'программирование'], duration_weeks: 12, lessons_per_week: 1, format: 'модульный', school_type: 'tech' },
  { title: 'Python: первые шаги', slug: 'python-первые-шаги', description: 'Основы программирования на Python. Переменные, циклы, функции, простые проекты.', age_min: 11, age_max: 13, directions: ['программирование', 'алгоритмы'], duration_weeks: 36, lessons_per_week: 1, format: 'годовой', school_type: 'tech' },
  { title: 'Микроконтроллеры: Arduino', slug: 'микроконтроллеры-arduino', description: 'Работа с Arduino: датчики, моторы, светодиоды. Проекты: умный свет, роботы, датчики.', age_min: 11, age_max: 13, directions: ['микроконтроллеры', 'робототехника'], duration_weeks: 24, lessons_per_week: 1, format: 'годовой', school_type: 'tech' },
  { title: 'Нейросети: знакомство', slug: 'нейросети-знакомство', description: 'Введение в нейросети. Как работают ИИ, генерация текста и изображений, этика.', age_min: 11, age_max: 13, directions: ['нейросети', 'программирование'], duration_weeks: 12, lessons_per_week: 1, format: 'модульный', school_type: 'tech' },
  { title: 'Веб-разработка', slug: 'веб-разработка', description: 'HTML, CSS, JavaScript. Создание сайтов, современные фреймворки, деплой.', age_min: 14, age_max: 18, directions: ['программирование'], duration_weeks: 36, lessons_per_week: 1, format: 'углублённый', school_type: 'tech' },
  { title: 'Алгоритмы и олимпиады', slug: 'алгоритмы-олимпиады', description: 'Подготовка к олимпиадам по программированию. Алгоритмы, структуры данных, решение задач.', age_min: 14, age_max: 18, directions: ['алгоритмы', 'программирование'], duration_weeks: 36, lessons_per_week: 1, format: 'углублённый', school_type: 'tech' },
  { title: 'Нейросети: практика', slug: 'нейросети-практика', description: 'Работа с нейросетями: API, fine-tuning, создание приложений с ИИ.', age_min: 14, age_max: 18, directions: ['нейросети', 'программирование'], duration_weeks: 24, lessons_per_week: 1, format: 'углублённый', school_type: 'tech' },
  { title: 'Микроконтроллеры: ESP32', slug: 'микроконтроллеры-esp32', description: 'Продвинутый уровень: ESP32, WiFi, IoT, проекты умного дома.', age_min: 14, age_max: 18, directions: ['микроконтроллеры', 'робототехника'], duration_weeks: 24, lessons_per_week: 1, format: 'углублённый', school_type: 'tech' },
  { title: 'Радиотехника', slug: 'радиотехника', description: 'Основы электроники: пайка, схемы, радиодетали. Проекты: приёмник, передатчик.', age_min: 14, age_max: 18, directions: ['радиотехника', 'микроконтроллеры'], duration_weeks: 24, lessons_per_week: 1, format: 'углублённый', school_type: 'tech' },
  { title: 'Рисование для малышей', slug: 'рисование-для-малышей', description: 'Основы рисования: карандаш, краски, кисти. Развитие мелкой моторики и творческого воображения.', age_min: 5, age_max: 7, directions: ['рисование', 'творчество'], duration_weeks: 12, lessons_per_week: 1, format: 'игровой', school_type: 'art' },
  { title: 'Живопись: акварель и гуашь', slug: 'живопись-акварель-гуашь', description: 'Основы живописи: акварель, гуашь. Цвет, композиция, натюрморт и пейзаж.', age_min: 8, age_max: 10, directions: ['живопись', 'рисование'], duration_weeks: 24, lessons_per_week: 1, format: 'модульный', school_type: 'art' },
  { title: 'Графика и иллюстрация', slug: 'графика-иллюстрация', description: 'Графические техники: карандаш, тушь, линогравюра. Создание иллюстраций и комиксов.', age_min: 11, age_max: 13, directions: ['графика', 'дизайн'], duration_weeks: 24, lessons_per_week: 1, format: 'годовой', school_type: 'art' },
  { title: 'Декоративно-прикладное искусство', slug: 'декоративно-прикладное-искусство', description: 'Роспись, керамика, работа с разными материалами. Создание поделок и сувениров.', age_min: 8, age_max: 10, directions: ['декоративно-прикладное искусство', 'творчество'], duration_weeks: 24, lessons_per_week: 1, format: 'модульный', school_type: 'art' },
  { title: 'Графический дизайн', slug: 'графический-дизайн', description: 'Основы дизайна: композиция, типографика, работа в графических редакторах.', age_min: 14, age_max: 18, directions: ['дизайн', 'графика'], duration_weeks: 24, lessons_per_week: 1, format: 'углублённый', school_type: 'art' },
];

const pool = new pg.Pool({ connectionString: DATABASE_URL });

for (const p of DEFAULT_PROGRAMS) {
  const direction = p.directions[0];
  const schoolType = p.school_type ?? 'tech';
  await pool.query(
    `INSERT INTO ${SCHEMA}.programs (title, slug, description, age_min, age_max, direction, directions, duration_weeks, lessons_per_week, format, school_type, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
     ON CONFLICT (slug) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       age_min = EXCLUDED.age_min,
       age_max = EXCLUDED.age_max,
       direction = EXCLUDED.direction,
       directions = EXCLUDED.directions,
       duration_weeks = EXCLUDED.duration_weeks,
       lessons_per_week = EXCLUDED.lessons_per_week,
       format = EXCLUDED.format,
       school_type = EXCLUDED.school_type,
       updated_at = EXCLUDED.updated_at`,
    [
      p.title,
      p.slug,
      p.description,
      p.age_min,
      p.age_max,
      direction,
      p.directions,
      p.duration_weeks,
      p.lessons_per_week ?? 1,
      p.format || '',
      schoolType,
      Date.now(),
    ]
  );
  console.log('Seeded:', p.title);
}

await pool.end();
console.log('Seed done');
