import { Database } from '@nozbe/watermelondb'
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs'

import { mySchema } from './schema'
import { Song, Progress } from './model'

let database: Database | null = null

try {
    const adapter = new LokiJSAdapter({
        schema: mySchema,
        useWebWorker: false,
        useIncrementalIndexedDB: true,
    })

    database = new Database({
        adapter,
        modelClasses: [Song, Progress],
    })
} catch (error) {
    console.warn('WatermelonDB unavailable, falling back to file persistence for progress data.', error)
}

export { database }
