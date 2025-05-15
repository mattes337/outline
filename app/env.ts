declare global {
  interface Window {
    env: Record<string, any>;
  }
}

const env = window.env;

if (!env) {
  throw new Error(
    "Config could not be be parsed. \nSee: https://docs.getoutline.com/s/hosting/doc/troubleshooting-HXckrzCqDJ#h-config-could-not-be-parsed"
  );
}

// Validate required environment variables
const requiredEnvVars = ['ENVIRONMENT', 'URL'];
const missingEnvVars = requiredEnvVars.filter(key => !env[key]);

if (missingEnvVars.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missingEnvVars.join(', ')}. \nSee: https://docs.getoutline.com/s/hosting/doc/troubleshooting-HXckrzCqDJ#h-config-could-not-be-parsed`
  );
}

export default env;
