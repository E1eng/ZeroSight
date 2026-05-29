/** @type {import('next').NextConfig} */
const nextConfig = {
  optimizeFonts: false,
  transpilePackages: ["@piplabs/cdr-sdk", "multiformats"],
  experimental: {
    typedRoutes: true,
    serverComponentsExternalPackages: ["@piplabs/cdr-crypto"]
  },
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Node.js built-ins do not exist in the browser. 
      // We strip the "node:" prefix so Webpack can match it against our fallback.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        "module": false,
        "fs": false,
        "crypto": false,
        "path": false,
        "os": false,
        "readline": false,
        "url": false,
      };

      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:/,
          (resource) => {
            resource.request = resource.request.replace(/^node:/, '');
          }
        )
      );
    }

    config.ignoreWarnings = [
      { module: /@piplabs\/cdr-crypto.*loader\.js/ },
      { message: /Critical dependency: the request of a dependency is an expression/ }
    ];

    return config;
  }
};

export default nextConfig;
