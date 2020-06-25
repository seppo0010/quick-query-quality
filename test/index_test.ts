import query, { querySync, Query } from '../src';
import assert = require('assert');

describe('index', () => {
    describe('comparisons', () => {
        it('should compare equal numbers sync', () => {
            assert.equal(querySync('1 = 1'), true);
            assert.equal(querySync('1 == 1'), true);
            assert.equal(querySync('1 === 1'), true);
            assert.equal(querySync('1 = 2'), false);
            assert.equal(querySync('1 == 2'), false);
            assert.equal(querySync('1 === 2'), false);
        });
        it('should compare equal numbers', () => {
            assert.equal(querySync('1 = 1'), true);
            assert.equal(querySync('1 == 1'), true);
            assert.equal(querySync('1 === 1'), true);
            assert.equal(querySync('1 = 2'), false);
            assert.equal(querySync('1 == 2'), false);
            assert.equal(querySync('1 === 2'), false);
        });
        it('should compare not equal numbers', () => {
            assert.equal(querySync('1 != 1'), false);
            assert.equal(querySync('1 !== 1'), false);
            assert.equal(querySync('1 != 2'), true);
            assert.equal(querySync('1 !== 2'), true);
        });
        it('should compare greater than numbers', () => {
            assert.equal(querySync('1 > 0'), true);
            assert.equal(querySync('1 > 1'), false);
        });
        it('should compare greater than or equal numbers', () => {
            assert.equal(querySync('1 >= 1'), true);
            assert.equal(querySync('1 >= 2'), false);
        });
        it('should compare less than numbers', () => {
            assert.equal(querySync('1 < 2'), true);
            assert.equal(querySync('1 < 0'), false);
        });
        it('should compare less than or equal numbers', () => {
            assert.equal(querySync('1 <= 1'), true);
            assert.equal(querySync('1 <= 0'), false);
        });
        it('should compare floats', () => {
            assert.equal(querySync('0.1 < 0.2'), true);
            assert.equal(querySync('1.21 > 1.2'), true);
        });
    });
    describe('and', () => {
        it('should be true iff both are true', () => {
            assert.equal(querySync('1 = 1 AND 2 = 2'), true);
            assert.equal(querySync('1 = 1 AND 2 = 3'), false);
            assert.equal(querySync('1 = 2 AND 2 = 2'), false);
            assert.equal(querySync('1 = 2 AND 2 = 3'), false);
        });
        it('should allow three components', () => {
            assert.equal(querySync('1 = 1 AND 2 = 2 AND 3 = 3'), true);
            assert.equal(querySync('1 = 2 AND 2 = 3 AND 3 = 4'), false);
        });
    });
    describe('bailing', () => {
        it('should not execute a second AND expression if the first one is false', () => {
            assert.equal(querySync('1 = 2 AND throwException = true', {
                throwException: () => {
                    throw new Error('unreachable');
                },
            }), false);
        });
        it('should not execute a second OR expression if the first one is true', () => {
            assert.equal(querySync('1 = 1 OR throwException = true', {
                throwException: () => {
                    throw new Error('unreachable');
                },
            }), true);
        });
        it('should not execute a second OR expression if the first one is true recursively', () => {
            assert.equal(querySync('1 = 1 OR (throwException = true AND 1 = 2)', {
                throwException: () => {
                    throw new Error('unreachable');
                },
            }), true);
        });
    });
    describe('or', () => {
        it('should be true iff either is true', () => {
            assert.equal(querySync('1 = 1 OR 2 = 2'), true);
            assert.equal(querySync('1 = 1 OR 2 = 3'), true);
            assert.equal(querySync('1 = 2 OR 2 = 2'), true);
            assert.equal(querySync('1 = 2 OR 2 = 3'), false);
        });
        it('should allow three components', () => {
            assert.equal(querySync('1 = 2 OR 2 = 3 OR 3 = 3'), true);
            assert.equal(querySync('1 = 2 OR 2 = 3 OR 3 = 4'), false);
        });
    });
    describe('parens', () => {
        it('should group', () => {
            assert.equal(querySync('(1 = 1 OR 2 = 2)'), true);
            assert.equal(querySync('(1 = 1 OR 2 = 3)'), true);
            assert.equal(querySync('(1 = 2 OR 2 = 2)'), true);
            assert.equal(querySync('(1 = 2 OR 2 = 3)'), false);
        });
        it('should run parenthesis before the rest', () => {
            assert.equal(querySync('(1 = 2 AND 2 = 3) OR 2 = 2'), true);
            assert.equal(querySync('1 = 2 AND (2 = 3 OR 2 = 2)'), false);
        });
    });
    describe('context', () => {
        it('should read a property of the context', () => {
            assert.equal(querySync('1 = mykey', { mykey: 1}), true);
            assert.equal(querySync('1 = mykey', { mykey: 2}), false);
        });
        it('should read read a property recursively', () => {
            assert.equal(querySync('1 = mykey.x', { mykey: { x: 1 }}), true);
            assert.equal(querySync('1 = mykey.x', { mykey: { x: 2 }}), false);
        });
        it('should be resilient to missing keys', () => {
            assert.equal(querySync('1 = mykey', { }), false);
            assert.equal(querySync('1 = mykey.x', { }), false);
        });
    });
    describe('promises', () => {
        it('calls a function', () => {
            assert.equal(querySync('1 = mykey', { mykey: () => 1 }), true);
            assert.equal(querySync('1 = mykey', { mykey: () => 2 }), false);
        });
        it('calls a function once', () => {
            let calls = 0;
            assert.equal(querySync('1 = mykey AND 2 > mykey', { mykey: () => {
                calls++;
                return 1;
            } }), true);
            assert.equal(calls, 1);
        });
        it('waits for function promise', async () => {
            assert.equal(await query('1 = mykey', { mykey: async () => 1 }), true);
            assert.equal(await query('1 = mykey', { mykey: () => new Promise((resolve, _reject) => process.nextTick(() => resolve(1))) }), true);
        });
        it('waits for function promise recursively', async () => {
            assert.equal(await query('1 = mykey.mykey2', { mykey: () => new Promise((resolve, _reject) => process.nextTick(() => resolve(
                {
                    mykey2: () => new Promise((resolve2, _reject2) => process.nextTick(() => resolve2(
                        1,
                    ))),
                },
            ))) }), true);
        });
    });
    describe('json', () => {
        it('should accept booleans', () => {
            assert.equal(querySync('true == true'), true);
            assert.equal(querySync('true == false'), false);
        });
        it('should accept arrays', () => {
            assert.equal(querySync('[0, 1, 2] == arr', { arr: [0, 1, 2]}), true);
            assert.equal(querySync('[0, 1, 2] == arr', { arr: [0, 1, 3]}), false);
            assert.equal(querySync('arr = [0, 1, 2]', { arr: [0, 1, 2]}), true);
            assert.equal(querySync('arr = [0, 1, 2]', { arr: [0, 1, 3]}), false);
        });
        it('should accept objects', () => {
            assert.equal(querySync('{"mykey": "myvalue"} == obj', { obj: { mykey: 'myvalue' }}), true);
            assert.equal(querySync('{"mykey": "myvalue2"} == obj', { obj: { mykey: 'myvalue' }}), false);
            assert.equal(querySync('{"mykey2": "myvalue"} == obj', { obj: { mykey: 'myvalue' }}), false);
            assert.equal(querySync('{} == obj', { obj: { mykey: 'myvalue' }}), false);
            assert.equal(querySync('"dog" == obj', { obj: { mykey: 'myvalue' }}), false);
        });
    });
    describe('functions', () => {
        it('should be able to call functions with parameters', () => {
            assert.equal(querySync('add(1, 2) == 3', { add: (v1: number, v2: number) => v1 + v2}), true);
        });
        it('should be able to call functions with promises', async () => {
            assert.equal(await query('add(1, 2) == 3', { add: (v1: number, v2: number) => Promise.resolve(v1 + v2)}), true);
        });
        it('should not throw exceptions when calling an undefined function', () => {
            assert.equal(querySync('add(1, 2) == 3', { }), false);
        });
    });
});

describe('Query class', () => {
    it('should be able to reuse query objects', () => {
        const q = new Query('1 == 1');
        assert.equal(q.runSync(), true);
        assert.equal(q.runSync(), true);
    });

    it('should be able to reuse query objects with different contexts', () => {
        const q = new Query('mykey == 1');
        assert.equal(q.runSync({ mykey: 1}), true);
        assert.equal(q.runSync({ mykey: 2}), false);
    });

    it('should be able to reuse query objects with different contexts with promises', async () => {
        const q = new Query('mykey == 1');
        assert.equal(await q.run({ mykey: () => Promise.resolve(1)}), true);
        assert.equal(await q.run({ mykey: () => Promise.resolve(2)}), false);
    });

    it('should not mix async contexts', async () => {
        const q = new Query('mykey == mykey2');
        (await Promise.all(Array(100).fill(0).map((_, i) => {
            return q.run({ mykey: () => new Promise((resolve, _reject) => {
                setTimeout(() => {
                    resolve(i);
                }, i % 10);
            }), mykey2: () => Promise.resolve(i) });
        }))).forEach((v) => assert.equal(v, true));
    });

    it('should throw an exception on invalid syntax', () => {
        assert.throws(() => {
            new Query('fruit is fruit').runSync();
        });
    });
});
