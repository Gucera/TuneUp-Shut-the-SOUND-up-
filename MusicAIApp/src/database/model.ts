import { Model } from '@nozbe/watermelondb'
import { field, date, readonly } from '@nozbe/watermelondb/decorators'

// Song model — stores info about each song
export class Song extends Model {
    static table = 'songs'

    @field('title') title!: string
    @field('artist') artist!: string
    @field('duration') duration!: number
    @field('is_analyzed') isAnalyzed!: boolean
    @date('created_at') createdAt!: Date
}

// Progress model — tracks the user's XP and level
export class Progress extends Model {
    static table = 'progress'

    @field('xp') xp!: number
    @field('level') level!: number
    @field('streak_days') streakDays!: number
}