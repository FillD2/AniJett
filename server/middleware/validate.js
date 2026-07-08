const { validationResult } = require('express-validator');

/**
 * Checks express-validator results and sends 400 if validation failed.
 * Returns true if valid, false if a 400 response has already been sent.
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @returns {boolean}
 */
const validateRequest = (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({ error: 'Validation failed', details: errors.array() });
        return false;
    }
    return true;
};

module.exports = { validateRequest };
