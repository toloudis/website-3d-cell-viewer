import React, { useState } from 'react';
import { Drawer, Button, Icon } from 'antd';

import './styles.css';

export function BottomPanel(props) {
    const [isVisible, setIsVisible] = useState(false);
    const toggleDrawer = () => {
        setIsVisible(!isVisible);
    };

    const closeButton = <Button
        className="options-button close-button"
        size="small"
        onClick={toggleDrawer}
    >
        Options
        <Icon type="double-right" className="button-arrow" />
    </Button>;

    return (
        <div className="container">
            <Drawer 
                className="drawer"
                placement="bottom"
                closable={false}
                getContainer={false}
                visible={isVisible}
                mask={false}
                title={closeButton}
            >
                <p>test</p>
            </Drawer>
        </div>
    );
}
