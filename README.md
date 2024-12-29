## LLM Compare

This benchmark was made to compare how prominent LLMs perform on a given set of prompts against the ground truth of expected answers. It was built as part of [this blog post comparing LLM performance on Bible recall](https://benkaiser.dev/can-llms-accurately-recall-the-bible/).

### Features

One of the nicest features of this repo, is the response caching. So if you run it again with the same prompt for the same model with the same parameters, it will return the cached response instead of making another API call. This saves on costs and time.

### Usage

To test your own prompts, simply copy config.json.example to config.json and fill in the prompts you'd like to test, add your API keys for all the LLM services and then run `npm install` and then `npm start`.