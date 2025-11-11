const DEFAULT_BAD_REQUEST_MESSAGE = 'Некорректные параметры запроса';

const isNil = (value) => value === null || value === undefined;

export function stringField(options = {}) {
  const {
    required = false,
    trim = true,
    minLength = required ? 1 : 0,
    maxLength,
    pattern,
    sanitize,
    transform,
    defaultValue,
    allowEmpty = false,
    coerce = true,
    label,
  } = options;

  return (input, context = {}) => {
    const fieldLabel = label || context.field || 'значение';

    if (isNil(input) || (typeof input === 'string' && !allowEmpty && input.length === 0)) {
      if (required && defaultValue === undefined) {
        return { error: `Поле "${fieldLabel}" обязательно.` };
      }
      if (defaultValue !== undefined) {
        return { value: defaultValue, shouldSet: true };
      }
      return { shouldSet: false };
    }

    let value = input;
    if (typeof value !== 'string') {
      if (!coerce) {
        return { error: `Поле "${fieldLabel}" должно быть строкой.` };
      }
      value = String(value);
    }

    if (trim) {
      value = value.trim();
    }

    if (!allowEmpty && value.length === 0) {
      if (required && defaultValue === undefined) {
        return { error: `Поле "${fieldLabel}" не может быть пустым.` };
      }
      if (defaultValue !== undefined) {
        return { value: defaultValue, shouldSet: true };
      }
      return { shouldSet: false };
    }

    if (typeof sanitize === 'function') {
      value = sanitize(value, context);
    }

    if (typeof transform === 'function') {
      value = transform(value, context);
    }

    if (!allowEmpty && value.length === 0) {
      if (required && defaultValue === undefined) {
        return { error: `Поле "${fieldLabel}" не может быть пустым.` };
      }
      if (defaultValue !== undefined) {
        return { value: defaultValue, shouldSet: true };
      }
      return { shouldSet: false };
    }

    if (minLength && value.length < minLength) {
      return {
        error: `Поле "${fieldLabel}" должно содержать не менее ${minLength} символов.`,
      };
    }

    if (maxLength && value.length > maxLength) {
      return {
        error: `Поле "${fieldLabel}" должно содержать не более ${maxLength} символов.`,
      };
    }

    if (pattern && !pattern.test(value)) {
      return {
        error: `Поле "${fieldLabel}" содержит недопустимые символы.`,
      };
    }

    return { value, shouldSet: true };
  };
}

export function enumField(options = {}) {
  const {
    required = false,
    values = [],
    caseInsensitive = false,
    defaultValue,
    transform,
    label,
  } = options;

  if (!Array.isArray(values) || values.length === 0) {
    throw new Error('enumField: необходимо передать массив допустимых значений.');
  }

  const labelSet = label;
  const normalizedValues = caseInsensitive
    ? values.map((item) => (typeof item === 'string' ? item.toLowerCase() : item))
    : values;

  return (input, context = {}) => {
    const fieldLabel = labelSet || context.field || 'значение';

    if (isNil(input) || (typeof input === 'string' && input.length === 0)) {
      if (required && defaultValue === undefined) {
        return { error: `Поле "${fieldLabel}" обязательно.` };
      }
      if (defaultValue !== undefined) {
        return { value: defaultValue, shouldSet: true };
      }
      return { shouldSet: false };
    }

    let candidate = input;
    if (typeof candidate === 'string') {
      candidate = candidate.trim();
    }

    let finalValue;

    if (caseInsensitive && typeof candidate === 'string') {
      const matchIndex = normalizedValues.indexOf(candidate.toLowerCase());
      if (matchIndex === -1) {
        return {
          error: `Поле "${fieldLabel}" содержит недопустимое значение.`,
        };
      }
      finalValue = values[matchIndex];
    } else if (values.includes(candidate)) {
      finalValue = candidate;
    } else {
      return {
        error: `Поле "${fieldLabel}" содержит недопустимое значение.`,
      };
    }

    if (typeof transform === 'function') {
      finalValue = transform(finalValue, context);
    }

    return { value: finalValue, shouldSet: true };
  };
}

export function createRequestValidator(schema = {}, options = {}) {
  const targets = ['params', 'query', 'body'];

  return (req, res, next) => {
    const errors = [];
    const validated = {};

    targets.forEach((target) => {
      if (!schema[target]) {
        return;
      }

      const source = req[target] || {};
      const validators = schema[target];
      const targetResult = {};

      Object.entries(validators).forEach(([field, validator]) => {
        if (typeof validator !== 'function') {
          throw new Error(
            `createRequestValidator: валидатор для "${target}.${field}" должен быть функцией.`,
          );
        }

        const rawValue = source[field];
        const result = validator(rawValue, { field, target, req });

        if (result && result.error) {
          errors.push({
            field,
            target,
            message: result.error,
          });
          return;
        }

        if (result && result.shouldSet) {
          targetResult[field] = result.value;
        }
      });

      if (Object.keys(targetResult).length > 0) {
        validated[target] = targetResult;
      }
    });

    if (errors.length > 0) {
      res.status(400).json({
        success: false,
        error: options.errorMessage || DEFAULT_BAD_REQUEST_MESSAGE,
        code: options.errorCode || 'BAD_REQUEST',
        details: errors,
      });
      return;
    }

    if (!req.validated) {
      req.validated = {};
    }

    Object.entries(validated).forEach(([target, values]) => {
      if (!req.validated[target]) {
        req.validated[target] = {};
      }
      Object.assign(req.validated[target], values);
    });

    next();
  };
}

export default {
  stringField,
  enumField,
  createRequestValidator,
};

