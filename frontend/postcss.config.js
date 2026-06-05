const isProduction = process.env.NODE_ENV === 'production'

export default {
  plugins: {
    autoprefixer: {},
    ...(isProduction
      ? {
          cssnano: {
            preset: [
              'default',
              {
                discardComments: {
                  removeAll: true,
                },
              },
            ],
          },
        }
      : {}),
  },
}
