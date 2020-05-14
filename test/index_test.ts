import query from '../src';
import assert = require('assert');

describe('index', () => {
    describe('comparisons', () => {
        it('should compare equal numbers', () => {
            assert.equal(query('1 = 1'), true);
            assert.equal(query('1 == 1'), true);
            assert.equal(query('1 === 1'), true);
        });
        it('should compare not equal numbers', () => {
            assert.equal(query('1 = 2'), false);
            assert.equal(query('1 == 2'), false);
            assert.equal(query('1 === 2'), false);
        });
        it('should compare greater than numbers', () => {
            assert.equal(query('1 > 0'), true);
        });
        it('should compare not greater than numbers', () => {
            assert.equal(query('1 > 1'), false);
        });
        it('should compare greater than or equal numbers', () => {
            assert.equal(query('1 >= 1'), true);
        });
        it('should compare not greater than or equal numbers', () => {
            assert.equal(query('1 >= 2'), false);
        });
        it('should compare less than numbers', () => {
            assert.equal(query('1 < 2'), true);
        });
        it('should compare not less than numbers', () => {
            assert.equal(query('1 < 0'), false);
        });
        it('should compare less than or equal numbers', () => {
            assert.equal(query('1 <= 1'), true);
        });
        it('should compare not less than or equal numbers', () => {
            assert.equal(query('1 <= 0'), false);
        });
    });
    describe('and', () => {
        it('should be true iff both are true', () => {
            assert.equal(query('1 = 1 AND 2 = 2'), true);
            assert.equal(query('1 = 1 AND 2 = 3'), false);
            assert.equal(query('1 = 2 AND 2 = 2'), false);
            assert.equal(query('1 = 2 AND 2 = 3'), false);
        });
        it('should allow three components', () => {
            assert.equal(query('1 = 1 AND 2 = 2 AND 3 = 3'), true);
            assert.equal(query('1 = 2 AND 2 = 3 AND 3 = 4'), false);
        });
    });
    describe('or', () => {
        it('should be true iff either is true', () => {
            assert.equal(query('1 = 1 OR 2 = 2'), true);
            assert.equal(query('1 = 1 OR 2 = 3'), true);
            assert.equal(query('1 = 2 OR 2 = 2'), true);
            assert.equal(query('1 = 2 OR 2 = 3'), false);
        });
        it('should allow three components', () => {
            assert.equal(query('1 = 2 OR 2 = 3 OR 3 = 3'), true);
            assert.equal(query('1 = 2 OR 2 = 3 OR 3 = 4'), false);
        });
    });
    describe('parens', () => {
        it('should group', () => {
            assert.equal(query('(1 = 1 OR 2 = 2)'), true);
            assert.equal(query('(1 = 1 OR 2 = 3)'), true);
            assert.equal(query('(1 = 2 OR 2 = 2)'), true);
            assert.equal(query('(1 = 2 OR 2 = 3)'), false);
        });
        it('should run parenthesis before the rest', () => {
            assert.equal(query('(1 = 2 AND 2 = 3) OR 2 = 2'), true);
            assert.equal(query('1 = 2 AND (2 = 3 OR 2 = 2)'), false);
        });
    });
});
