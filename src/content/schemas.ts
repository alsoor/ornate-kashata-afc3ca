import { z } from 'zod';
export const schemas = {
  home: z.object({
    "appName": z.string(),
    "channelSearch": z.string(),
    "whisperLabel": z.string()
  }),
  privacy: z.object({
    "VISIBILITY_OPTIONS": z.array(z.object({
      "value": z.string(),
      "label": z.string(),
      "id": z.string()
    }))
  }),
  share: z.object({
    "bars": z.array(z.number())
  }),
  pages: {
    live: z.object({
      "seo": z.object({
        "title": z.string(),
        "description": z.string(),
        "heading": z.string()
      })
    }),
    add_friend: z.object({
      "QUICK_EMOJIS": z.array(z.string())
    })
  }
};
export type Schemas = typeof schemas;