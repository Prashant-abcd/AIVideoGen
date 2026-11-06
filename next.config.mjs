/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    optimizePackageImports: ['antd', '@ant-design/icons', '@ant-design/cssinjs'],
  },
};

export default nextConfig;
