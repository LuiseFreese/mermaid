import type {ReactNode} from 'react';
import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Secure',
    Svg: require('@site/static/img/undraw_authentication_1evl.svg').default,
    description: (
      <>
        Built with enterprise-grade security in mind. Integrates seamlessly 
        with Microsoft Dataverse authentication and follows security best practices.
      </>
    ),
  },
  {
    title: 'Fast',
    Svg: require('@site/static/img/undraw_visionary-technology_f6b3.svg').default,
    description: (
      <>
        Convert your Mermaid ERD diagrams to Dataverse solutions in seconds.
        Automated validation and intelligent table/column generation streamline your workflow.
      </>
    ),
  },
  {
    title: 'Open Source',
    Svg: require('@site/static/img/undraw_github-profile_abde.svg').default,
    description: (
      <>
        Fully open source and community-driven. Contribute, customize, and extend
        the converter to meet your specific needs.
      </>
    ),
  },
];

function Feature({title, Svg, description}: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
