import query from '../src';
import assert = require('assert');

describe('index', () => {
    describe('comparisons', () => {
        it('should compare equal numbers', async () => {
            assert.equal(await query('1 = 1'), true);
            assert.equal(await query('1 == 1'), true);
            assert.equal(await query('1 === 1'), true);
            assert.equal(await query('1 = 2'), false);
            assert.equal(await query('1 == 2'), false);
            assert.equal(await query('1 === 2'), false);
        });
        it('should compare not equal numbers', async () => {
            assert.equal(await query('1 != 1'), false);
            assert.equal(await query('1 !== 1'), false);
            assert.equal(await query('1 != 2'), true);
            assert.equal(await query('1 !== 2'), true);
        });
        it('should compare greater than numbers', async () => {
            assert.equal(await query('1 > 0'), true);
            assert.equal(await query('1 > 1'), false);
        });
        it('should compare greater than or equal numbers', async () => {
            assert.equal(await query('1 >= 1'), true);
            assert.equal(await query('1 >= 2'), false);
        });
        it('should compare less than numbers', async () => {
            assert.equal(await query('1 < 2'), true);
            assert.equal(await query('1 < 0'), false);
        });
        it('should compare less than or equal numbers', async () => {
            assert.equal(await query('1 <= 1'), true);
            assert.equal(await query('1 <= 0'), false);
        });
    });
    describe('and', () => {
        it('should be true iff both are true', async () => {
            assert.equal(await query('1 = 1 AND 2 = 2'), true);
            assert.equal(await query('1 = 1 AND 2 = 3'), false);
            assert.equal(await query('1 = 2 AND 2 = 2'), false);
            assert.equal(await query('1 = 2 AND 2 = 3'), false);
        });
        it('should allow three components', async () => {
            assert.equal(await query('1 = 1 AND 2 = 2 AND 3 = 3'), true);
            assert.equal(await query('1 = 2 AND 2 = 3 AND 3 = 4'), false);
        });
    });
    describe('or', () => {
        it('should be true iff either is true', async () => {
            assert.equal(await query('1 = 1 OR 2 = 2'), true);
            assert.equal(await query('1 = 1 OR 2 = 3'), true);
            assert.equal(await query('1 = 2 OR 2 = 2'), true);
            assert.equal(await query('1 = 2 OR 2 = 3'), false);
        });
        it('should allow three components', async () => {
            assert.equal(await query('1 = 2 OR 2 = 3 OR 3 = 3'), true);
            assert.equal(await query('1 = 2 OR 2 = 3 OR 3 = 4'), false);
        });
    });
    describe('parens', () => {
        it('should group', async () => {
            assert.equal(await query('(1 = 1 OR 2 = 2)'), true);
            assert.equal(await query('(1 = 1 OR 2 = 3)'), true);
            assert.equal(await query('(1 = 2 OR 2 = 2)'), true);
            assert.equal(await query('(1 = 2 OR 2 = 3)'), false);
        });
        it('should run parenthesis before the rest', async () => {
            assert.equal(await query('(1 = 2 AND 2 = 3) OR 2 = 2'), true);
            assert.equal(await query('1 = 2 AND (2 = 3 OR 2 = 2)'), false);
        });
    });
    describe('context', () => {
        it('should read a property of the context', async () => {
            assert.equal(await query('1 = mykey', { mykey: 1}), true);
            assert.equal(await query('1 = mykey', { mykey: 2}), false);
        });
        it('should read read a property recursively', async () => {
            assert.equal(await query('1 = mykey.x', { mykey: { x: 1 }}), true);
            assert.equal(await query('1 = mykey.x', { mykey: { x: 2 }}), false);
        });
        it('should be resilient to missing keys', async () => {
            assert.equal(await query('1 = mykey', { }), false);
            assert.equal(await query('1 = mykey.x', { }), false);
        });
    });
    describe('promises', () => {
        it('calls a function', async () => {
            assert.equal(await query('1 = mykey', { mykey: () => 1 }), true);
            assert.equal(await query('1 = mykey', { mykey: () => 2 }), false);
        });
        it('calls a function once', async () => {
            let calls = 0;
            assert.equal(await query('1 = mykey AND 2 > mykey', { mykey: () => {
                calls++;
                return 1;
            } }), true);
            assert.equal(calls, 1);
        });
        it('waits for function promise', async () => {
            assert.equal(await query('1 = mykey', { mykey: async () => 1 }), true);
            assert.equal(await query('1 = mykey', { mykey: () => new Promise((resolve, _reject) => process.nextTick(() => resolve(1))) }), true);
        });
    });
});
