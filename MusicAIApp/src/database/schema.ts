import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const mySchema = appSchema({
    version: 1,
    tables: [
        // Songs table
        tableSchema({
            name: 'songs',
            columns: [
                { name: 'title', type: 'string' },
                { name: 'artist', type: 'string' },
                { name: 'duration', type: 'number' },
                { name: 'is_analyzed', type: 'boolean' },
                { name: 'created_at', type: 'number' },
            ],
        }),
        // User progress table
        tableSchema({
            name: 'progress',
            columns: [
                { name: 'xp', type: 'number' },
                { name: 'level', type: 'number' },
                { name: 'streak_days', type: 'number' },
            ],
        }),
    ],
})