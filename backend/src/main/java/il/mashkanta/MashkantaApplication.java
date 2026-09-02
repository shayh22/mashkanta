package il.mashkanta;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/** Entry point for the mortgage comparison and optimization backend. */
@SpringBootApplication
@EnableScheduling
@EnableAsync
public class MashkantaApplication {

    public static void main(String[] args) {
        SpringApplication.run(MashkantaApplication.class, args);
    }
}
