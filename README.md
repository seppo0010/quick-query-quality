# quick query quality

Query javascript objects with a simple language.

## Installation

```
npm i --save quick-query-quality
```

## Simple Usage

If you have all the data locally, you can run a simple query.

```
import { querySync } from '../src';
const data = [
    {title: 'Galaxy Trucker', designer: 'Vlaada Chvatil'},
    {title: 'Codenames', designer: 'Vlaada Chvatil'},
    {title: 'Power Grid', designer: 'Friedemann Friese'},
]
data.filter((row) => querySync('designer = "Vlaada Chvatil"', row)) //  [ { title: 'Galaxy Trucker', designer: 'Vlaada Chvatil' }, { title: 'Codenames', designer: 'Vlaada Chvatil' } ]
```

## Advance Usage

If any of the properties returns a Promise, you have to use the async version that waits for all promises to be resolved.

```
import query from '../src';
class Boardgame {
    async fetchData(): { designer: string } {
        // ...
    }
}
async () => {
    const data = [new Boardgame(), /* ... */]
    data.filter((row) => query('fetchData.designer = "Vlaada Chvatil"', row))
}
```
