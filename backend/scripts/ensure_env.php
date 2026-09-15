<?php

$root = dirname(__DIR__);
$envPath = $root . DIRECTORY_SEPARATOR . '.env';
$examplePath = $root . DIRECTORY_SEPARATOR . '.env.example';

if (!file_exists($envPath)) {
    if (!copy($examplePath, $envPath)) {
        fwrite(STDERR, "Unable to create .env from .env.example.\n");
        exit(1);
    }
    fwrite(STDOUT, "Created .env from .env.example.\n");
}

$contents = file_get_contents($envPath);
if ($contents === false) {
    fwrite(STDERR, "Unable to read .env.\n");
    exit(1);
}

if (preg_match('/^APP_KEY=[ \t]*$/m', $contents)) {
    $key = 'base64:' . base64_encode(random_bytes(32));
    $updated = preg_replace('/^APP_KEY=[ \t]*$/m', 'APP_KEY=' . $key, $contents, 1, $count);
    if ($count !== 1 || $updated === null || file_put_contents($envPath, $updated) === false) {
        fwrite(STDERR, "Unable to generate APP_KEY in .env.\n");
        exit(1);
    }
    fwrite(STDOUT, "Generated APP_KEY because it was empty.\n");
}
