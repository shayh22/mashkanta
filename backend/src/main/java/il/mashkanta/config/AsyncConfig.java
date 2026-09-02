package il.mashkanta.config;

import java.util.concurrent.Executor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/**
 * The worker pool that runs document extraction off the request threads.
 *
 * <p>The queue is bounded and the pool small: extraction is CPU-bound, so letting an unbounded queue
 * accumulate would trade a fast rejection for a slow timeout and drag the calculation endpoints down
 * with it.
 */
@Configuration
public class AsyncConfig {

    @Bean("documentExecutor")
    public Executor documentExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("doc-");
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();
        return executor;
    }
}
