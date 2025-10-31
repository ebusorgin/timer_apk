// Скопируйте этот файл в config.js и вставьте свой API ключ
const CONFIG = {
    OPENAI_API_KEY: 'your-api-key-here',
    OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
    MODEL: 'gpt-3.5-turbo',
    AVAILABLE_MODELS: [
        { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Быстрая и экономичная' },
        { id: 'gpt-4', name: 'GPT-4', description: 'Более умная модель' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Улучшенная версия GPT-4' },
        { id: 'gpt-4o', name: 'GPT-4o', description: 'Самая продвинутая модель' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Быстрая версия GPT-4o' }
    ]
};

